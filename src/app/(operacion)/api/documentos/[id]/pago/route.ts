import { NextResponse } from "next/server";
import { z } from "zod";

import {
  leerBody,
  parseId,
  requerirDocumentoEditable,
  requerirUsuario,
  respuesta404,
  respuestaError,
} from "@/lib/api";
import { query, withTransaction } from "@/lib/db";

const MEDIOS_PAGO = [
  "EFECTIVO",
  "SPEI",
  "TRANSFERENCIA",
  "TARJETA",
  "CHEQUE",
  "FINANCIAMIENTO",
  "OTRO",
] as const;

const fechaPagoSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((valor) => {
    const [anio, mes, dia] = valor.split("-").map(Number);
    const fecha = new Date(Date.UTC(anio, mes - 1, dia));
    return fecha.getUTCFullYear() === anio
      && fecha.getUTCMonth() === mes - 1
      && fecha.getUTCDate() === dia;
  });

const montoSchema = z.string()
  .regex(/^\d{1,16}(?:\.\d{1,2})?$/)
  .refine((valor) => BigInt(valor.replace(".", "")) > 0n);

const registroSchema = z.object({
  accion: z.literal("registrar"),
  medio: z.enum(MEDIOS_PAGO),
  monto: montoSchema,
  fechaPago: fechaPagoSchema,
  referencia: z.string().trim().max(120).optional(),
  detalle: z.string().trim().max(240).optional(),
  comprobanteVersion: z.number().int().positive(),
}).superRefine((valor, contexto) => {
  if (valor.medio === "OTRO") {
    if ((valor.detalle?.length ?? 0) < 10) {
      contexto.addIssue({
        code: "custom",
        path: ["detalle"],
        message: "Describe el medio de pago y su referencia.",
      });
    }
    return;
  }
  if ((valor.referencia?.length ?? 0) < 3) {
    contexto.addIssue({
      code: "custom",
      path: ["referencia"],
      message: "Indica la referencia trazable del pago.",
    });
  }
});

const bodySchema = z.discriminatedUnion("accion", [
  registroSchema,
  z.object({ accion: z.literal("certificar") }),
]);

type ResumenPago = {
  expediente_id: number;
  captura_estado: string | null;
  escaneado: boolean;
  precio_total: string | null;
  total_registrado: string;
  diferencia: string | null;
  conciliado: boolean;
  pago_verificado: boolean;
  umbral_efectivo_pld: string;
};

type RenglonPago = {
  id: string;
  medio: (typeof MEDIOS_PAGO)[number];
  monto: string;
  fecha_pago: string;
  referencia: string | null;
  detalle: string | null;
  comprobante_version: number;
  registrado_en: string;
};

type Comprobante = {
  version: number;
  content_type: string;
  tamano_bytes: string;
  subido_en: string;
};

async function obtenerResumenPago(documentoId: number): Promise<ResumenPago | null> {
  const resultado = await query<ResumenPago>(
    `SELECT d.expediente_id::int AS expediente_id,
            dc.estado::text AS captura_estado,
            EXISTS (
              SELECT 1 FROM traza.archivo_escaneado a
               WHERE a.documento_id = d.id
            ) AS escaneado,
            precio.valor_numero::text AS precio_total,
            pagos.total_registrado::text AS total_registrado,
            CASE
              WHEN precio.valor_numero IS NULL THEN NULL
              ELSE (precio.valor_numero - pagos.total_registrado)::text
            END AS diferencia,
            precio.valor_numero IS NOT NULL
              AND pagos.total_registrado = precio.valor_numero AS conciliado,
            EXISTS (
              SELECT 1 FROM traza.certificacion_pago_c02 cp
               WHERE cp.documento_id = d.id
            ) AS pago_verificado,
            traza.umbral_efectivo_pld()::text AS umbral_efectivo_pld
       FROM traza.documento d
       LEFT JOIN traza.documento_captura dc ON dc.documento_id = d.id
       LEFT JOIN traza.documento_campo_valor precio
         ON precio.documento_id = d.id AND precio.campo_pdf = 'c02_precio_num'
       LEFT JOIN LATERAL (
         SELECT COALESCE(sum(monto), 0)::numeric(18, 2) AS total_registrado
           FROM traza.pago_c02
          WHERE documento_id = d.id
       ) pagos ON true
      WHERE d.id = $1 AND d.tipo_codigo = 'C-02'`,
    [documentoId],
  );
  return resultado.rows[0] ?? null;
}

// El estado llega calculado por PostgreSQL: la UI solamente lo explica y nunca
// decide que un contrato quedó pagado.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error: authError } = await requerirUsuario();
  if (authError) return authError;

  const id = parseId((await params).id);
  if (id === null) return respuesta404("Documento no encontrado");

  try {
    const resumen = await obtenerResumenPago(id);
    if (!resumen) return respuesta404("Contrato C-02 no encontrado");

    const [pagos, comprobantes] = await Promise.all([
      query<RenglonPago>(
        `SELECT id::text, medio::text, monto::text, fecha_pago::text,
                referencia, detalle, comprobante_version::int,
                registrado_en::text
           FROM traza.pago_c02
          WHERE documento_id = $1
          ORDER BY registrado_en, id`,
        [id],
      ),
      query<Comprobante>(
        `SELECT version::int, content_type, tamano_bytes::text, subido_en::text
           FROM traza.anexo_expediente
          WHERE expediente_id = $1 AND clave = 'comprobante_pago'
          ORDER BY version DESC`,
        [resumen.expediente_id],
      ),
    ]);

    return NextResponse.json({
      precioTotal: resumen.precio_total,
      totalRegistrado: resumen.total_registrado,
      diferencia: resumen.diferencia,
      conciliado: resumen.conciliado,
      capturaCompleta: resumen.captura_estado === "COMPLETA",
      escaneado: resumen.escaneado,
      pagoVerificado: resumen.pago_verificado,
      umbralEfectivoPld: resumen.umbral_efectivo_pld,
      pagos: pagos.rows.map((pago) => ({
        id: pago.id,
        medio: pago.medio,
        monto: pago.monto,
        fechaPago: pago.fecha_pago,
        referencia: pago.referencia,
        detalle: pago.detalle,
        comprobanteVersion: pago.comprobante_version,
        registradoEn: pago.registrado_en,
      })),
      comprobantes: comprobantes.rows.map((comprobante) => ({
        version: comprobante.version,
        contentType: comprobante.content_type,
        tamanoBytes: Number(comprobante.tamano_bytes),
        subidoEn: comprobante.subido_en,
      })),
    });
  } catch (error) {
    return respuestaError(error);
  }
}

// Registra un medio o certifica el conjunto. El cuerpo no lleva expediente,
// precio ni usuario: todos se derivan del documento y de la sesión del servidor.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { usuario, error: authError } = await requerirUsuario();
  if (authError) return authError;

  const id = parseId((await params).id);
  if (id === null) return respuesta404("Documento no encontrado");
  const cierreError = await requerirDocumentoEditable(id, usuario);
  if (cierreError) return cierreError;

  const { data, error: bodyError } = await leerBody(request, bodySchema);
  if (bodyError) return bodyError;

  try {
    const respuesta = await withTransaction(async (client) => {
      const documento = await client.query<{ expediente_id: number; tipo_codigo: string }>(
        `SELECT expediente_id::int, tipo_codigo
           FROM traza.documento
          WHERE id = $1
          FOR UPDATE`,
        [id],
      );
      if (documento.rowCount === 0) return { clase: "NO_ENCONTRADO" as const };
      if (documento.rows[0].tipo_codigo !== "C-02") return { clase: "TIPO_INVALIDO" as const };

      if (data.accion === "certificar") {
        const certificado = await client.query<{ certificado_en: string }>(
          `SELECT certificado_en::text
             FROM traza.certificar_pago_c02($1, $2)`,
          [id, usuario.id],
        );
        return { clase: "CERTIFICADO" as const, certificadoEn: certificado.rows[0]?.certificado_en };
      }

      const pago = await client.query<{ id: string }>(
        `INSERT INTO traza.pago_c02 (
           documento_id, expediente_id, medio, monto, fecha_pago, referencia,
           detalle, comprobante_version, registrado_por
         ) VALUES ($1, $2, $3, $4::numeric, $5::date, $6, $7, $8, $9)
         RETURNING id::text`,
        [
          id,
          documento.rows[0].expediente_id,
          data.medio,
          data.monto,
          data.fechaPago,
          data.referencia?.trim() || null,
          data.detalle?.trim() || null,
          data.comprobanteVersion,
          usuario.id,
        ],
      );
      return { clase: "REGISTRADO" as const, pagoId: pago.rows[0].id };
    });

    if (respuesta.clase === "NO_ENCONTRADO") return respuesta404("Documento no encontrado");
    if (respuesta.clase === "TIPO_INVALIDO") {
      return NextResponse.json(
        { error: "La verificación de pago solo aplica al contrato C-02" },
        { status: 409 },
      );
    }
    if (respuesta.clase === "CERTIFICADO") {
      return NextResponse.json({ documentoId: id, pagoVerificado: true, certificadoEn: respuesta.certificadoEn });
    }
    return NextResponse.json({ documentoId: id, pagoId: respuesta.pagoId }, { status: 201 });
  } catch (error) {
    return respuestaError(error);
  }
}

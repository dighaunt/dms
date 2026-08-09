import "server-only";

import type { PoolClient } from "pg";
import { z } from "zod";

import { query, withTransaction } from "@/lib/db";
import { aCentavos, deCentavos } from "@/lib/finanzas/calculos";
import { firmarComoInterno } from "@/lib/finanzas/documentos";
import {
  HORAS_ALERTA_CUSTODIA,
  custodiaEstaVencida,
  etiquetaCustodia,
} from "@/lib/finanzas/formato";
import {
  esquemaFechaHoraIso,
  esquemaHashSha256,
  esquemaId,
  esquemaIdentificacion,
  esquemaImporteMonetario,
  esquemaPinFirma,
  esquemaVin,
  type EstadoDocumentoFinanciero,
  type TipoRci,
} from "@/lib/finanzas/tipos";

function aNumero(valor: string | number): number {
  return typeof valor === "number" ? valor : Number(valor);
}

function aNumeroOpcional(valor: string | number | null | undefined): number | null {
  return valor === null || valor === undefined ? null : aNumero(valor);
}

function aIso(valor: Date | string): string {
  return (valor instanceof Date ? valor : new Date(valor)).toISOString();
}

function aIsoOpcional(valor: Date | string | null | undefined): string | null {
  return valor === null || valor === undefined ? null : aIso(valor);
}

const textoOpcional = (maximo: number) =>
  z
    .string()
    .trim()
    .max(maximo)
    .nullish()
    .transform((valor) => (valor ? valor : null));

const esquemaVinOpcional = z
  .string()
  .nullish()
  .transform((valor) => (valor ?? "").trim())
  .pipe(esquemaVin.or(z.literal("").transform(() => null)));

const esquemaCodigoCatalogo = z
  .string()
  .transform((valor) => valor.trim().toUpperCase())
  .refine(
    (valor) => /^[A-Z_]{2,40}$/.test(valor),
    "El código de catálogo se escribe con letras mayúsculas y guiones bajos",
  );

const CONCEPTO_OTRO = "OTRO";

export const esquemaReciboCaja = z
  .object({
    
    vendedorEmpleadoId: esquemaId,
    vendedorIdTipo: esquemaIdentificacion.shape.tipo,
    vendedorIdNumero: esquemaIdentificacion.shape.numero,
    clienteNombre: z
      .string()
      .trim()
      .min(3, "Captura el nombre del cliente")
      .max(160),
    vehiculoDescripcion: textoOpcional(200),
    vin: esquemaVinOpcional,
    
    fechaHoraCobro: esquemaFechaHoraIso,
    
    documentoVentaId: esquemaId.nullish().transform((valor) => valor ?? null),
    
    folioVentaTexto: textoOpcional(60),
    conceptoCodigo: esquemaCodigoCatalogo,
    conceptoOtro: textoOpcional(160),
    importeTotal: esquemaImporteMonetario,
  })

  
  
  .superRefine((datos, ctx) => {
    if (datos.documentoVentaId === null && !datos.folioVentaTexto) {
      ctx.addIssue({
        code: "custom",
        path: ["folioVentaTexto"],
        message: "Indica el folio de venta que ampara el cobro",
      });
    }
    if (datos.conceptoCodigo === CONCEPTO_OTRO && !datos.conceptoOtro) {
      ctx.addIssue({
        code: "custom",
        path: ["conceptoOtro"],
        message: "Escribe cuál es el concepto del cobro",
      });
    }
  });

export type EntradaReciboCaja = z.input<typeof esquemaReciboCaja>;

export type ReciboCaja = {
  documentoId: number;
  vendedorEmpleadoId: number;
  vendedorIdTipo: string;
  vendedorIdNumero: string;
  clienteNombre: string;
  vehiculoDescripcion: string | null;
  vin: string | null;
  fechaHoraCobro: string;
  documentoVentaId: number | null;
  folioVentaTexto: string | null;
  conceptoCodigo: string;
  conceptoOtro: string | null;
  
  importeTotal: string;
};

type FilaReciboCaja = {
  documento_id: string | number;
  vendedor_empleado_id: string | number;
  vendedor_id_tipo: string;
  vendedor_id_numero: string;
  cliente_nombre: string;
  vehiculo_descripcion: string | null;
  vin: string | null;
  fecha_hora_cobro: Date | string;
  documento_venta_id: string | number | null;
  folio_venta_texto: string | null;
  concepto_codigo: string;
  concepto_otro: string | null;
  importe_total: string;
};

const COLUMNAS_RECIBO_CAJA = `documento_id, vendedor_empleado_id, vendedor_id_tipo,
         vendedor_id_numero, cliente_nombre, vehiculo_descripcion, vin,
         fecha_hora_cobro, documento_venta_id, folio_venta_texto,
         concepto_codigo, concepto_otro, importe_total`;

function filaAReciboCaja(fila: FilaReciboCaja): ReciboCaja {
  return {
    documentoId: aNumero(fila.documento_id),
    vendedorEmpleadoId: aNumero(fila.vendedor_empleado_id),
    vendedorIdTipo: fila.vendedor_id_tipo,
    vendedorIdNumero: fila.vendedor_id_numero,
    clienteNombre: fila.cliente_nombre,
    vehiculoDescripcion: fila.vehiculo_descripcion,
    vin: fila.vin,
    fechaHoraCobro: aIso(fila.fecha_hora_cobro),
    documentoVentaId: aNumeroOpcional(fila.documento_venta_id),
    folioVentaTexto: fila.folio_venta_texto,
    conceptoCodigo: fila.concepto_codigo,
    conceptoOtro: fila.concepto_otro,
    importeTotal: fila.importe_total,
  };
}

async function reabrirSiEstabaEnFirma(
  cliente: PoolClient,
  documentoId: number,
  usuarioId: number,
): Promise<void> {
  const { rows } = await cliente.query<{ estado: EstadoDocumentoFinanciero | null }>(
    `SELECT traza.estado_documento_fin($1) AS estado`,
    [documentoId],
  );
  if (rows[0]?.estado !== "PENDIENTE_DE_FIRMA") return;

  await cliente.query(`SELECT traza.cambiar_estado_documento_fin($1, 'BORRADOR', $2)`, [
    documentoId,
    usuarioId,
  ]);
}

export async function capturarReciboCaja(
  documentoId: number,
  datos: EntradaReciboCaja,
  usuario: number,
): Promise<ReciboCaja> {
  const id = esquemaId.parse(documentoId);
  const usuarioId = esquemaId.parse(usuario);
  const recibo = esquemaReciboCaja.parse(datos);

  return withTransaction(async (cliente) => {
    await reabrirSiEstabaEnFirma(cliente, id, usuarioId);

    const { rows } = await cliente.query<FilaReciboCaja>(
      `INSERT INTO traza.recibo_caja_rci01
         (documento_id, vendedor_empleado_id, vendedor_id_tipo, vendedor_id_numero,
          cliente_nombre, vehiculo_descripcion, vin, fecha_hora_cobro,
          documento_venta_id, folio_venta_texto, concepto_codigo, concepto_otro,
          importe_total)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (documento_id) DO UPDATE
          SET vendedor_empleado_id = EXCLUDED.vendedor_empleado_id,
              vendedor_id_tipo     = EXCLUDED.vendedor_id_tipo,
              vendedor_id_numero   = EXCLUDED.vendedor_id_numero,
              cliente_nombre       = EXCLUDED.cliente_nombre,
              vehiculo_descripcion = EXCLUDED.vehiculo_descripcion,
              vin                  = EXCLUDED.vin,
              fecha_hora_cobro     = EXCLUDED.fecha_hora_cobro,
              documento_venta_id   = EXCLUDED.documento_venta_id,
              folio_venta_texto    = EXCLUDED.folio_venta_texto,
              concepto_codigo      = EXCLUDED.concepto_codigo,
              concepto_otro        = EXCLUDED.concepto_otro,
              importe_total        = EXCLUDED.importe_total
       RETURNING ${COLUMNAS_RECIBO_CAJA}`,
      [
        id,
        recibo.vendedorEmpleadoId,
        recibo.vendedorIdTipo,
        recibo.vendedorIdNumero,
        recibo.clienteNombre,
        recibo.vehiculoDescripcion,
        recibo.vin,
        recibo.fechaHoraCobro,
        recibo.documentoVentaId,
        recibo.folioVentaTexto,
        recibo.conceptoCodigo,
        recibo.conceptoOtro,
        recibo.importeTotal,
      ],
    );
    return filaAReciboCaja(rows[0]);
  });
}

export async function obtenerReciboCaja(documentoId: number): Promise<ReciboCaja | null> {
  const id = esquemaId.parse(documentoId);
  const { rows } = await query<FilaReciboCaja>(
    `SELECT ${COLUMNAS_RECIBO_CAJA}
       FROM traza.recibo_caja_rci01
      WHERE documento_id = $1`,
    [id],
  );
  return rows[0] ? filaAReciboCaja(rows[0]) : null;
}

export const esquemaDenominacion = z.object({
  
  denominacion: esquemaImporteMonetario,
  cantidad: z
    .number()
    .int("La cantidad de piezas es un número entero")
    .positive("Un renglón del arqueo cuenta al menos una pieza"),
});

export type EntradaDenominacion = z.input<typeof esquemaDenominacion>;

export const esquemaDesgloseDenominaciones = z
  .array(esquemaDenominacion)
  .max(40, "El arqueo no lleva tantos renglones; revisa el desglose")
  .superRefine((filas, ctx) => {
    const vistas = new Set<string>();
    filas.forEach((fila, indice) => {
      if (vistas.has(fila.denominacion)) {
        ctx.addIssue({
          code: "custom",
          path: [indice, "denominacion"],
          message: `La denominación ${fila.denominacion} aparece dos veces; súmala en un solo renglón`,
        });
      }
      vistas.add(fila.denominacion);
    });
  });

export type RenglonArqueo = {
  denominacion: string;
  cantidad: number;
  
  subtotal: string;
};

export type DesgloseArqueo = {
  documentoId: number;
  renglones: RenglonArqueo[];
  
  total: string;
};

type FilaDenominacion = {
  denominacion: string;
  cantidad: number;
  subtotal: string;
};

function aDesglose(documentoId: number, filas: FilaDenominacion[]): DesgloseArqueo {

  const total = filas.reduce((acumulado, fila) => acumulado + (aCentavos(fila.subtotal) ?? 0n), 0n);

  return {
    documentoId,
    renglones: filas.map((fila) => ({
      denominacion: fila.denominacion,
      cantidad: fila.cantidad,
      subtotal: fila.subtotal,
    })),
    total: deCentavos(total),
  };
}

const COLUMNAS_DENOMINACION = `denominacion::text AS denominacion, cantidad, subtotal::text AS subtotal`;

export async function registrarDenominaciones(
  documentoId: number,
  desglose: EntradaDenominacion[],
): Promise<DesgloseArqueo> {
  const id = esquemaId.parse(documentoId);
  const renglones = esquemaDesgloseDenominaciones.parse(desglose);

  return withTransaction(async (cliente) => {
    await cliente.query(`DELETE FROM traza.denominacion_rci01 WHERE documento_id = $1`, [id]);

    if (renglones.length > 0) {
      await cliente.query(
        `INSERT INTO traza.denominacion_rci01 (documento_id, denominacion, cantidad)
         SELECT $1, d.denominacion, d.cantidad
           FROM unnest($2::numeric[], $3::integer[]) AS d(denominacion, cantidad)`,
        [
          id,
          renglones.map((renglon) => renglon.denominacion),
          renglones.map((renglon) => renglon.cantidad),
        ],
      );
    }

    
    const { rows } = await cliente.query<FilaDenominacion>(
      `SELECT ${COLUMNAS_DENOMINACION}
         FROM traza.denominacion_rci01
        WHERE documento_id = $1
        ORDER BY denominacion DESC`,
      [id],
    );
    return aDesglose(id, rows);
  });
}

export async function obtenerDenominaciones(documentoId: number): Promise<DesgloseArqueo> {
  const id = esquemaId.parse(documentoId);
  const { rows } = await query<FilaDenominacion>(
    `SELECT ${COLUMNAS_DENOMINACION}
       FROM traza.denominacion_rci01
      WHERE documento_id = $1
      ORDER BY denominacion DESC`,
    [id],
  );
  return aDesglose(id, rows);
}

export async function validarArqueo(documentoId: number): Promise<void> {
  const id = esquemaId.parse(documentoId);
  await query(`SELECT traza.validar_arqueo_rci01($1)`, [id]);
}

export const esquemaIngresoServicio = z.object({
  clienteNombre: z.string().trim().min(3, "Captura el nombre del cliente").max(160),
  vehiculoDescripcion: textoOpcional(200),
  placas: textoOpcional(20),
  ordenServicio: z
    .string()
    .trim()
    .min(1, "Captura el número de orden de servicio")
    .max(40),
  fechaHoraCobro: esquemaFechaHoraIso,
  descripcionServicio: z
    .string()
    .trim()
    .min(5, "Describe el servicio que se cobra")
    .max(1000),
  
  cobradorEmpleadoId: esquemaId,
  
  formaPago: esquemaCodigoCatalogo,
  importeTotal: esquemaImporteMonetario,
});

export type EntradaIngresoServicio = z.input<typeof esquemaIngresoServicio>;

export type IngresoServicio = {
  documentoId: number;
  clienteNombre: string;
  vehiculoDescripcion: string | null;
  placas: string | null;
  ordenServicio: string;
  fechaHoraCobro: string;
  descripcionServicio: string;
  cobradorEmpleadoId: number;
  formaPago: string;
  importeTotal: string;
};

type FilaIngresoServicio = {
  documento_id: string | number;
  cliente_nombre: string;
  vehiculo_descripcion: string | null;
  placas: string | null;
  orden_servicio: string;
  fecha_hora_cobro: Date | string;
  descripcion_servicio: string;
  cobrador_empleado_id: string | number;
  forma_pago: string;
  importe_total: string;
};

const COLUMNAS_INGRESO_SERVICIO = `documento_id, cliente_nombre, vehiculo_descripcion, placas,
         orden_servicio, fecha_hora_cobro, descripcion_servicio,
         cobrador_empleado_id, forma_pago, importe_total`;

function filaAIngresoServicio(fila: FilaIngresoServicio): IngresoServicio {
  return {
    documentoId: aNumero(fila.documento_id),
    clienteNombre: fila.cliente_nombre,
    vehiculoDescripcion: fila.vehiculo_descripcion,
    placas: fila.placas,
    ordenServicio: fila.orden_servicio,
    fechaHoraCobro: aIso(fila.fecha_hora_cobro),
    descripcionServicio: fila.descripcion_servicio,
    cobradorEmpleadoId: aNumero(fila.cobrador_empleado_id),
    formaPago: fila.forma_pago,
    importeTotal: fila.importe_total,
  };
}

export async function capturarIngresoServicio(
  documentoId: number,
  datos: EntradaIngresoServicio,
  usuario: number,
): Promise<IngresoServicio> {
  const id = esquemaId.parse(documentoId);
  const usuarioId = esquemaId.parse(usuario);
  const servicio = esquemaIngresoServicio.parse(datos);

  return withTransaction(async (cliente) => {
    await reabrirSiEstabaEnFirma(cliente, id, usuarioId);

    const { rows } = await cliente.query<FilaIngresoServicio>(
      `INSERT INTO traza.ingreso_servicio_rci04
         (documento_id, cliente_nombre, vehiculo_descripcion, placas, orden_servicio,
          fecha_hora_cobro, descripcion_servicio, cobrador_empleado_id, forma_pago,
          importe_total)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (documento_id) DO UPDATE
          SET cliente_nombre       = EXCLUDED.cliente_nombre,
              vehiculo_descripcion = EXCLUDED.vehiculo_descripcion,
              placas               = EXCLUDED.placas,
              orden_servicio       = EXCLUDED.orden_servicio,
              fecha_hora_cobro     = EXCLUDED.fecha_hora_cobro,
              descripcion_servicio = EXCLUDED.descripcion_servicio,
              cobrador_empleado_id = EXCLUDED.cobrador_empleado_id,
              forma_pago           = EXCLUDED.forma_pago,
              importe_total        = EXCLUDED.importe_total
       RETURNING ${COLUMNAS_INGRESO_SERVICIO}`,
      [
        id,
        servicio.clienteNombre,
        servicio.vehiculoDescripcion,
        servicio.placas,
        servicio.ordenServicio,
        servicio.fechaHoraCobro,
        servicio.descripcionServicio,
        servicio.cobradorEmpleadoId,
        servicio.formaPago,
        servicio.importeTotal,
      ],
    );
    return filaAIngresoServicio(rows[0]);
  });
}

export async function obtenerIngresoServicio(
  documentoId: number,
): Promise<IngresoServicio | null> {
  const id = esquemaId.parse(documentoId);
  const { rows } = await query<FilaIngresoServicio>(
    `SELECT ${COLUMNAS_INGRESO_SERVICIO}
       FROM traza.ingreso_servicio_rci04
      WHERE documento_id = $1`,
    [id],
  );
  return rows[0] ? filaAIngresoServicio(rows[0]) : null;
}

export const esquemaFiltroCustodia = z.object({
  sucursalId: esquemaId.optional(),
  
  horasMinimas: z.number().positive().max(24 * 90).default(HORAS_ALERTA_CUSTODIA),
});

export type FiltroCustodia = z.input<typeof esquemaFiltroCustodia>;

export type CustodiaPendiente = {
  documentoId: number;
  folio: string;
  folioCompleto: string;
  tipoCodigo: TipoRci;
  sucursalId: number;
  sucursalClave: string;
  estado: EstadoDocumentoFinanciero | null;
  
  importe: string | null;
  fechaHoraCobro: string | null;
  horasEnTransito: number | null;
  custodiaConfirmada: boolean;
  
  vencida: boolean;
  
  etiqueta: string;
};

type FilaCustodia = {
  documento_id: string | number;
  folio: string;
  folio_completo: string;
  tipo_codigo: string;
  sucursal_id: string | number;
  sucursal_clave: string;
  estado: string | null;
  importe: string | null;
  fecha_hora_cobro: Date | string | null;
  custodia_confirmada: boolean;
  horas_en_transito: string | number | null;
};

export async function custodiaPendiente(
  filtro: FiltroCustodia = {},
): Promise<CustodiaPendiente[]> {
  const { sucursalId, horasMinimas } = esquemaFiltroCustodia.parse(filtro);

  const { rows } = await query<FilaCustodia>(
    `SELECT c.documento_id,
            c.folio,
            c.folio_completo,
            c.tipo_codigo,
            c.sucursal_id,
            c.sucursal_clave,
            c.estado,
            c.importe,
            c.fecha_hora_cobro,
            c.custodia_confirmada,
            c.horas_en_transito
       FROM traza.v_custodia_pendiente c
      WHERE ($1::bigint IS NULL OR c.sucursal_id = $1)
      ORDER BY c.horas_en_transito DESC NULLS LAST, c.documento_id`,
    [sucursalId ?? null],
  );

  return rows.map((fila) => {
    const horasEnTransito =
      fila.horas_en_transito === null ? null : Number(fila.horas_en_transito);

    return {
      documentoId: aNumero(fila.documento_id),
      folio: fila.folio,
      folioCompleto: fila.folio_completo,
      tipoCodigo: fila.tipo_codigo as TipoRci,
      sucursalId: aNumero(fila.sucursal_id),
      sucursalClave: fila.sucursal_clave,
      estado: fila.estado as EstadoDocumentoFinanciero | null,
      importe: fila.importe,
      fechaHoraCobro: aIsoOpcional(fila.fecha_hora_cobro),
      horasEnTransito,
      custodiaConfirmada: fila.custodia_confirmada,
      vencida: custodiaEstaVencida(horasEnTransito, horasMinimas),
      etiqueta: etiquetaCustodia(fila.custodia_confirmada),
    };
  });
}

export const esquemaConfirmarCustodia = z.object({
  documentoId: esquemaId,
  
  custodio: esquemaId,
  pin: esquemaPinFirma,
  
  hashContenido: esquemaHashSha256,
  origenSesion: z.string().trim().max(200).nullish(),
});

export type EntradaConfirmarCustodia = z.input<typeof esquemaConfirmarCustodia>;

export async function confirmarCustodia(
  entrada: EntradaConfirmarCustodia,
): Promise<EstadoDocumentoFinanciero> {
  const datos = esquemaConfirmarCustodia.parse(entrada);

  return firmarComoInterno({
    documentoId: datos.documentoId,
    rol: "RECIBIO_CUSTODIO",
    usuario: datos.custodio,
    pin: datos.pin,
    hashContenido: datos.hashContenido,
    origenSesion: datos.origenSesion,
  });
}

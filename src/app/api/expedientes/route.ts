import { NextResponse } from "next/server";
import { z } from "zod";

import {
  formatearFolio,
  leerBody,
  requerirUsuario,
  respuestaError,
} from "@/lib/api";
import { withTransaction } from "@/lib/db";

const bodySchema = z.object({
  vin: z
    .string()
    .transform((v) => v.toUpperCase())
    .pipe(z.string().regex(/^[A-HJ-NPR-Z0-9]{17}$/, "VIN inválido: 17 caracteres, sin I/O/Q")),
  marcaNombre: z.string().trim().min(1),
  modeloNombre: z.string().trim().min(1),
  anioModelo: z.number().int().min(1980).max(2100),
  color: z.string().trim().min(1),
  numMotor: z.string().trim().min(1),
  kilometraje: z.number().int().min(0),
  origen: z.enum(["PROPIA", "CONSIGNADA"]),
});

type DocumentoRow = {
  id: string;
  tipo_codigo: string;
  revision: string;
  anio: number;
  consecutivo: number;
};

// Abre expediente y emite el juego día 0 en la MISMA transacción:
// contrato fuente (C-03/C-04 según origen) + F-03 + F-05 + F-06.
export async function POST(request: Request) {
  const { usuario, error: authError } = await requerirUsuario();
  if (authError) return authError;

  const { data, error: bodyError } = await leerBody(request, bodySchema);
  if (bodyError) return bodyError;

  try {
    const resultado = await withTransaction(async (client) => {
      const marca = await client.query<{ id: string }>(
        `INSERT INTO traza.marca (nombre) VALUES ($1)
         ON CONFLICT (nombre) DO UPDATE SET nombre = EXCLUDED.nombre
         RETURNING id`,
        [data.marcaNombre],
      );
      const modelo = await client.query<{ id: string }>(
        `INSERT INTO traza.modelo (marca_id, nombre) VALUES ($1, $2)
         ON CONFLICT (marca_id, nombre) DO UPDATE SET nombre = EXCLUDED.nombre
         RETURNING id`,
        [marca.rows[0].id, data.modeloNombre],
      );
      await client.query(
        `INSERT INTO traza.unidad
             (vin, modelo_id, anio_modelo, color, num_motor, kilometraje_ingreso, creado_por)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          data.vin,
          modelo.rows[0].id,
          data.anioModelo,
          data.color ?? null,
          data.numMotor ?? null,
          data.kilometraje ?? null,
          usuario.id,
        ],
      );
      const expediente = await client.query<{
        id: string;
        anio: number;
        consecutivo: number;
      }>(`SELECT * FROM traza.abrir_expediente($1, $2, $3)`, [
        data.vin,
        data.origen,
        usuario.id,
      ]);
      const exp = expediente.rows[0];

      const contratoFuente = data.origen === "PROPIA" ? "C-03" : "C-04";
      const juegoDia0 = [contratoFuente, "F-03", "F-05", "F-06"];
      const folios = [];
      for (const tipo of juegoDia0) {
        const doc = await client.query<DocumentoRow>(
          `SELECT * FROM traza.emitir_folio($1, $2, $3)`,
          [tipo, exp.id, usuario.id],
        );
        const d = doc.rows[0];
        folios.push({
          documentoId: Number(d.id),
          tipo: d.tipo_codigo,
          revision: d.revision,
          folio: formatearFolio(d.tipo_codigo, d.anio, d.consecutivo),
        });
      }

      return {
        expediente: {
          id: Number(exp.id),
          numeroExpediente: `${exp.anio}-${String(exp.consecutivo).padStart(3, "0")}`,
          vin: data.vin,
          origen: data.origen,
        },
        folios,
      };
    });

    return NextResponse.json(resultado, { status: 201 });
  } catch (error) {
    return respuestaError(error);
  }
}

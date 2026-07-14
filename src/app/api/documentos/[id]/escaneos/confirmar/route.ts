import { NextResponse } from "next/server";
import { z } from "zod";

import {
  leerBody,
  parseId,
  requerirUsuario,
  respuesta404,
  respuestaError,
} from "@/lib/api";
import { withTransaction } from "@/lib/db";

const bodySchema = z.object({
  sha256: z.string().regex(/^[0-9a-f]{64}$/, "sha256 hex en minúsculas"),
  rutaObjeto: z.string().trim().min(1).startsWith("expedientes/"),
  tamanoBytes: z.number().int().min(1),
});

// Registra el escaneo subido a R2. Reescaneo = nueva versión, nunca edición.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { usuario, error: authError } = await requerirUsuario();
  if (authError) return authError;

  const id = parseId((await params).id);
  if (id === null) return respuesta404("Documento no encontrado");

  const { data, error: bodyError } = await leerBody(request, bodySchema);
  if (bodyError) return bodyError;

  try {
    const resultado = await withTransaction(async (client) => {
      const doc = await client.query<{ id: number; cancelado: boolean }>(
        `SELECT d.id,
                EXISTS (SELECT 1 FROM traza.documento_cancelacion c
                         WHERE c.documento_id = d.id) AS cancelado
           FROM traza.documento d WHERE d.id = $1`,
        [id],
      );
      if (doc.rowCount === 0) return null;
      if (doc.rows[0].cancelado) {
        throw Object.assign(
          new Error("Documento CANCELADO: se conserva pero no admite nuevos escaneos"),
          { code: "P0001" },
        );
      }

      // Cubre reintentos y carreras entre pestañas aun si ambas llegaron a
      // pedir un URL antes de que una de ellas confirmara el mismo archivo.
      const existente = await client.query<{
        documento_id: number;
        version: number;
        folio: string;
      }>(
        `SELECT a.documento_id, a.version, vd.folio
           FROM traza.archivo_escaneado a
           JOIN traza.v_documento vd ON vd.id = a.documento_id
          WHERE a.sha256 = $1`,
        [data.sha256],
      );
      if ((existente.rowCount ?? 0) > 0) {
        const archivo = existente.rows[0];
        if (archivo.documento_id === doc.rows[0].id) {
          return { version: archivo.version, yaRegistrado: true };
        }
        throw Object.assign(
          new Error(
            `Este archivo ya está resguardado en ${archivo.folio}. Cada folio debe conservar su propio documento firmado.`,
          ),
          { code: "P0001" },
        );
      }

      const insertado = await client.query<{ version: number }>(
        `INSERT INTO traza.archivo_escaneado
           (documento_id, version, sha256, ruta_objeto, tamano_bytes, subido_por)
         SELECT $1,
                COALESCE((SELECT max(version) FROM traza.archivo_escaneado
                           WHERE documento_id = $1), 0) + 1,
                $2, $3, $4, $5
         RETURNING version`,
        [id, data.sha256, data.rutaObjeto, data.tamanoBytes, usuario.id],
      );
      return { version: insertado.rows[0].version, yaRegistrado: false };
    });

    if (resultado === null) return respuesta404("Documento no encontrado");
    return NextResponse.json(
      { documentoId: id, version: resultado.version, yaRegistrado: resultado.yaRegistrado },
      { status: resultado.yaRegistrado ? 200 : 201 },
    );
  } catch (error) {
    return respuestaError(error);
  }
}

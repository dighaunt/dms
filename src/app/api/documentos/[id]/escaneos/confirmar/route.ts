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
    const version = await withTransaction(async (client) => {
      const doc = await client.query<{ cancelado: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM traza.documento_cancelacion c
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
      return insertado.rows[0].version;
    });

    if (version === null) return respuesta404("Documento no encontrado");
    return NextResponse.json({ documentoId: id, version }, { status: 201 });
  } catch (error) {
    return respuestaError(error);
  }
}

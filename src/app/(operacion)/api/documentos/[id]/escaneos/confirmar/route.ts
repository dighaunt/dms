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
import { withTransaction } from "@/lib/db";

const bodySchema = z.object({
  nombreArchivo: z.string().trim().min(1).max(255),
  contentType: z.enum(["application/pdf", "image/jpeg", "image/png", "image/webp"]),
  sha256: z.string().regex(/^[0-9a-f]{64}$/, "sha256 hex en minúsculas"),
  rutaObjeto: z.string().trim().min(1).startsWith("expedientes/"),
  tamanoBytes: z.number().int().min(1),
});

// Registra un adjunto inmutable del documento. Un documento puede tener una
// colección de PDFs y páginas/fotos sin convertirlas en falsos reescaneos.
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
        id: number;
      }>(
        `SELECT id FROM traza.documento_adjunto WHERE documento_id = $1 AND sha256 = $2`,
        [id, data.sha256],
      );
      if ((existente.rowCount ?? 0) > 0) {
        return { archivoId: existente.rows[0].id, yaRegistrado: true };
      }

      const insertado = await client.query<{ id: number }>(
        `INSERT INTO traza.documento_adjunto
           (documento_id, nombre_archivo, content_type, sha256, ruta_objeto, tamano_bytes, subido_por)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [id, data.nombreArchivo, data.contentType, data.sha256, data.rutaObjeto, data.tamanoBytes, usuario.id],
      );
      return { archivoId: insertado.rows[0].id, yaRegistrado: false };
    });

    if (resultado === null) return respuesta404("Documento no encontrado");
    return NextResponse.json(
      { documentoId: id, archivoId: resultado.archivoId, yaRegistrado: resultado.yaRegistrado },
      { status: resultado.yaRegistrado ? 200 : 201 },
    );
  } catch (error) {
    return respuestaError(error);
  }
}

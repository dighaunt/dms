import { NextResponse } from "next/server";
import { z } from "zod";

import {
  leerBody,
  parseId,
  requerirExpedienteEditable,
  requerirUsuario,
  respuesta404,
  respuestaError,
} from "@/lib/api";
import { fichaAnexo } from "@/lib/anexos";
import { query } from "@/lib/db";

const bodySchema = z.object({
  clave: z.string().trim().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/, "sha256 hex en minúsculas"),
  rutaObjeto: z.string().trim().min(1).startsWith("anexos/"),
  contentType: z.string().trim().min(1),
  tamanoBytes: z.number().int().min(1),
});

// Registra el anexo subido al store. Re-subir = nueva versión, nunca edición.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { usuario, error: authError } = await requerirUsuario();
  if (authError) return authError;

  const id = parseId((await params).id);
  if (id === null) return respuesta404("Expediente no encontrado");
  const cierreError = await requerirExpedienteEditable(id, usuario);
  if (cierreError) return cierreError;

  const { data, error: bodyError } = await leerBody(request, bodySchema);
  if (bodyError) return bodyError;
  if (!fichaAnexo(data.clave)) return respuesta404("Anexo no catalogado");

  try {
    const existe = await query(`SELECT 1 FROM traza.expediente WHERE id = $1`, [id]);
    if (existe.rowCount === 0) return respuesta404("Expediente no encontrado");

    const insertado = await query<{ version: number }>(
      `INSERT INTO traza.anexo_expediente
         (expediente_id, clave, version, sha256, ruta_objeto, content_type, tamano_bytes, subido_por)
       SELECT $1, $2,
              COALESCE((SELECT max(version) FROM traza.anexo_expediente
                         WHERE expediente_id = $1 AND clave = $2), 0) + 1,
              $3, $4, $5, $6, $7
       RETURNING version`,
      [id, data.clave, data.sha256, data.rutaObjeto, data.contentType, data.tamanoBytes, usuario.id],
    );
    return NextResponse.json(
      { expedienteId: id, clave: data.clave, version: insertado.rows[0].version },
      { status: 201 },
    );
  } catch (error) {
    return respuestaError(error);
  }
}

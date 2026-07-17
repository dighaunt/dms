import { NextResponse } from "next/server";

import { parseId, requerirUsuario, respuesta404, respuestaError } from "@/lib/api";
import { query } from "@/lib/db";

// Colección completa de evidencia del folio. Cada versión es un adjunto
// inmutable; la UI la presenta como Archivo 1..N, no como un reemplazo.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error: authError } = await requerirUsuario();
  if (authError) return authError;
  const id = parseId((await params).id);
  if (id === null) return respuesta404("Documento no encontrado");
  try {
    const archivos = await query<{ id: number; nombre_archivo: string; content_type: string; tamano_bytes: string; subido_en: string; subido_por_nombre: string }>(
      `SELECT a.id, a.nombre_archivo, a.content_type, a.tamano_bytes::text, a.subido_en::text, u.nombre AS subido_por_nombre
         FROM traza.documento_adjunto a
         JOIN traza.usuario u ON u.id = a.subido_por
        WHERE a.documento_id = $1
        ORDER BY a.subido_en, a.id`,
      [id],
    );
    return NextResponse.json(archivos.rows.map((a) => ({
      id: a.id,
      nombreArchivo: a.nombre_archivo,
      contentType: a.content_type,
      tamanoBytes: Number(a.tamano_bytes),
      subidoEn: a.subido_en,
      subidoPorNombre: a.subido_por_nombre,
    })));
  } catch (error) {
    return respuestaError(error);
  }
}

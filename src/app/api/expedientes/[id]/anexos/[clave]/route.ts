import { NextResponse } from "next/server";

import { parseId, requerirUsuario, respuesta404, respuestaError } from "@/lib/api";
import { fichaAnexo } from "@/lib/anexos";
import { query } from "@/lib/db";

type VersionAnexo = {
  version: number;
  content_type: string;
  tamano_bytes: string;
  subido_en: string;
  subido_por_nombre: string;
};

// Lista TODAS las versiones de una clave (no solo la última): alimenta el
// wizard/galería de anexos multi-archivo. Cada versión sigue siendo un
// archivo propio, nunca un reemplazo — ver migración 013.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; clave: string }> },
) {
  const { error: authError } = await requerirUsuario();
  if (authError) return authError;

  const { id: idCrudo, clave } = await params;
  const id = parseId(idCrudo);
  if (id === null) return respuesta404("Expediente no encontrado");
  if (!fichaAnexo(clave)) return respuesta404("Anexo no catalogado");

  try {
    const { rows } = await query<VersionAnexo>(
      `SELECT version, content_type, tamano_bytes::text AS tamano_bytes,
              subido_en::text AS subido_en, subido_por_nombre
         FROM public.anexos_todos
        WHERE expediente_id = $1 AND clave = $2
        ORDER BY version DESC`,
      [id, clave],
    );
    return NextResponse.json(
      rows.map((r) => ({
        version: r.version,
        contentType: r.content_type,
        tamanoBytes: Number(r.tamano_bytes),
        subidoEn: r.subido_en,
        subidoPorNombre: r.subido_por_nombre,
      })),
    );
  } catch (error) {
    return respuestaError(error);
  }
}

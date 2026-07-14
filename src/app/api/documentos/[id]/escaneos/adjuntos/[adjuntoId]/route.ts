import { NextResponse } from "next/server";

import { parseId, requerirUsuario, respuesta404, respuestaError } from "@/lib/api";
import { query } from "@/lib/db";
import { presignGet } from "@/lib/storage/presign";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; adjuntoId: string }> },
) {
  const { error: authError } = await requerirUsuario();
  if (authError) return authError;
  const { id: rawId, adjuntoId: rawAdjuntoId } = await params;
  const id = parseId(rawId);
  const adjuntoId = parseId(rawAdjuntoId);
  if (id === null || adjuntoId === null) return respuesta404("Archivo no encontrado");
  try {
    const archivo = await query<{ ruta_objeto: string }>(
      `SELECT ruta_objeto FROM traza.documento_adjunto WHERE id = $1 AND documento_id = $2`,
      [adjuntoId, id],
    );
    if ((archivo.rowCount ?? 0) === 0) return respuesta404("Archivo no encontrado");
    return NextResponse.redirect(await presignGet(archivo.rows[0].ruta_objeto), 302);
  } catch (error) {
    return respuestaError(error);
  }
}

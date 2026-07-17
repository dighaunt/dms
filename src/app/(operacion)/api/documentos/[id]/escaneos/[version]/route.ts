import { NextResponse } from "next/server";

import { parseId, requerirUsuario, respuesta404, respuestaError } from "@/lib/api";
import { query } from "@/lib/db";
import { presignGet } from "@/lib/storage/presign";

// Lectura de un escaneo: redirige a un GET prefirmado (bucket privado).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; version: string }> },
) {
  const { error: authError } = await requerirUsuario();
  if (authError) return authError;

  const { id: idCrudo, version: versionCruda } = await params;
  const id = parseId(idCrudo);
  const version = parseId(versionCruda);
  if (id === null || version === null) return respuesta404("Escaneo no encontrado");

  try {
    const escaneo = await query<{ ruta_objeto: string }>(
      `SELECT ruta_objeto FROM traza.archivo_escaneado
        WHERE documento_id = $1 AND version = $2`,
      [id, version],
    );
    if (escaneo.rowCount === 0) return respuesta404("Escaneo no encontrado");

    const url = await presignGet(escaneo.rows[0].ruta_objeto);
    return NextResponse.redirect(url, 302);
  } catch (error) {
    return respuestaError(error);
  }
}

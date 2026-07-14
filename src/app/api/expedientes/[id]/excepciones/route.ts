import { NextResponse } from "next/server";
import { z } from "zod";

import {
  leerBody,
  parseId,
  requerirUsuario,
  respuesta404,
  respuestaError,
  TIPOS_LEGACY,
} from "@/lib/api";
import { query } from "@/lib/db";

const bodySchema = z.object({
  tipoCodigo: z.enum(TIPOS_LEGACY),
  motivo: z.string().trim().min(40, "El motivo debe explicarse con al menos 40 caracteres"),
});

// Paso 2: cualquier usuario declara la excepción, pero traza.declarar_excepcion_legacy
// la rechaza si no hay un token de modo riesgo vigente emitido por OTRO usuario
// (regla de dos personas) — este endpoint no es donde vive el candado, solo lo llama.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { usuario, error: authError } = await requerirUsuario();
  if (authError) return authError;

  const id = parseId((await params).id);
  if (id === null) return respuesta404("Expediente no encontrado");

  const { data, error: bodyError } = await leerBody(request, bodySchema);
  if (bodyError) return bodyError;

  try {
    const existe = await query(`SELECT 1 FROM traza.expediente WHERE id = $1`, [id]);
    if (existe.rowCount === 0) return respuesta404("Expediente no encontrado");

    const excepcion = await query<{ id: string; tipo_codigo: string }>(
      `SELECT * FROM traza.declarar_excepcion_legacy($1, $2, $3, $4)`,
      [id, data.tipoCodigo, data.motivo, usuario.id],
    );
    const e = excepcion.rows[0];
    return NextResponse.json(
      { excepcionId: Number(e.id), tipoCodigo: e.tipo_codigo },
      { status: 201 },
    );
  } catch (error) {
    return respuestaError(error);
  }
}

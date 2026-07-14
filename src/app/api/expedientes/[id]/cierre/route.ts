import { NextResponse } from "next/server";

import { parseId, requerirN3, respuesta404, respuestaError } from "@/lib/api";
import { query } from "@/lib/db";

// El cierre es una constancia de fin de ciclo. La BD vuelve a validar todos
// los requisitos antes de escribirla; la interfaz no puede cerrarlo sola.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { usuario, error: authError } = await requerirN3("Solo N3 puede cerrar un expediente");
  if (authError) return authError;

  const id = parseId((await params).id);
  if (id === null) return respuesta404("Expediente no encontrado");

  try {
    const cierre = await query<{ cerrado_en: string }>(
      `SELECT cerrado_en::text FROM traza.cerrar_expediente($1, $2)`,
      [id, usuario.id],
    );
    return NextResponse.json({ expedienteId: id, cerrado: true, cerradoEn: cierre.rows[0].cerrado_en }, { status: 201 });
  } catch (error) {
    return respuestaError(error);
  }
}

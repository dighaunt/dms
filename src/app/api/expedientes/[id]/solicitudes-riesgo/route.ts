import { NextResponse } from "next/server";
import { z } from "zod";

import {
  TIPOS_LEGACY,
  leerBody,
  parseId,
  requerirUsuario,
  respuesta404,
  respuestaError,
} from "@/lib/api";
import { query } from "@/lib/db";

const bodySchema = z.object({
  tipoCodigo: z.enum(TIPOS_LEGACY),
  motivo: z.string().trim().min(40),
});

// Solicita una excepción legacy. El candado de nivel (N3) vive en la
// decisión, no aquí: cualquier usuario autenticado puede solicitar.
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

  const existe = await query(`SELECT 1 FROM traza.expediente WHERE id = $1`, [id]);
  if (existe.rowCount === 0) return respuesta404("Expediente no encontrado");

  try {
    const solicitud = await query<{
      id: string;
      expediente_id: string;
      tipo_codigo: string;
      motivo: string;
      solicitado_por: string;
      solicitado_en: string;
    }>(`SELECT * FROM traza.solicitar_excepcion_legacy($1, $2, $3, $4)`, [
      id,
      data.tipoCodigo,
      data.motivo,
      usuario.id,
    ]);
    const s = solicitud.rows[0];
    return NextResponse.json(
      {
        solicitudId: Number(s.id),
        tipoCodigo: s.tipo_codigo,
        solicitadoEn: s.solicitado_en,
      },
      { status: 201 },
    );
  } catch (error) {
    return respuestaError(error);
  }
}

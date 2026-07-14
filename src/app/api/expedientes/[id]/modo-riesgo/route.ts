import { NextResponse } from "next/server";
import { z } from "zod";

import {
  leerBody,
  parseId,
  requerirN3,
  respuesta404,
  respuestaError,
  TIPOS_LEGACY,
} from "@/lib/api";
import { query } from "@/lib/db";

const bodySchema = z.object({
  tipoCodigo: z.enum(TIPOS_LEGACY),
  motivo: z.string().trim().min(40, "El motivo debe explicarse con al menos 40 caracteres"),
});

// Paso 1 del procedimiento de excepción legacy: un N3 autoriza un token de
// un solo uso, atado a este expediente + tipo, válido 2 horas. El candado
// real (nivel N3, whitelist, un token vigente a la vez) vive en
// traza.emitir_token_riesgo — este gate es solo la primera barrera.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { usuario, error: authError } = await requerirN3(
    "Modo riesgo solo puede autorizarlo un administrador global (N3)",
  );
  if (authError) return authError;

  const id = parseId((await params).id);
  if (id === null) return respuesta404("Expediente no encontrado");

  const { data, error: bodyError } = await leerBody(request, bodySchema);
  if (bodyError) return bodyError;

  try {
    const existe = await query(`SELECT 1 FROM traza.expediente WHERE id = $1`, [id]);
    if (existe.rowCount === 0) return respuesta404("Expediente no encontrado");

    const token = await query<{
      id: string;
      tipo_codigo: string;
      motivo: string;
      emitido_en: string;
      expira_en: string;
    }>(
      `SELECT * FROM traza.emitir_token_riesgo($1, $2, $3, $4)`,
      [id, data.tipoCodigo, data.motivo, usuario.id],
    );
    const t = token.rows[0];
    return NextResponse.json(
      {
        tokenId: Number(t.id),
        tipoCodigo: t.tipo_codigo,
        motivo: t.motivo,
        emitidoEn: t.emitido_en,
        expiraEn: t.expira_en,
      },
      { status: 201 },
    );
  } catch (error) {
    return respuestaError(error);
  }
}

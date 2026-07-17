import { NextResponse } from "next/server";
import { z } from "zod";

import { leerBody, parseId, requerirExpedienteEditable, requerirN3, respuesta404, respuestaError, TIPOS_DOCUMENTO } from "@/lib/api";
import { query } from "@/lib/db";

const bodySchema = z.object({ tipoCodigo: z.enum(TIPOS_DOCUMENTO), motivo: z.string().trim().min(40) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { usuario, error: authError } = await requerirN3("Solo N3 puede anular un requisito excepcionalmente");
  if (authError) return authError;
  const id = parseId((await params).id);
  if (id === null) return respuesta404("Expediente no encontrado");
  const { data, error: bodyError } = await leerBody(request, bodySchema);
  if (bodyError) return bodyError;
  const cierreError = await requerirExpedienteEditable(id, usuario);
  if (cierreError) return cierreError;
  try {
    await query(`SELECT traza.anular_documento_excepcional($1,$2,$3,$4)`, [id, data.tipoCodigo, data.motivo, usuario.id]);
    return NextResponse.json({ expedienteId: id, tipoCodigo: data.tipoCodigo }, { status: 201 });
  } catch (error) { return respuestaError(error); }
}

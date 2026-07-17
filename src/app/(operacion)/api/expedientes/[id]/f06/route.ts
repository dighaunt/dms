import { NextResponse } from "next/server";
import { z } from "zod";

import {
  ESTADOS_EXPEDIENTE,
  leerBody,
  parseId,
  requerirExpedienteEditable,
  requerirUsuario,
  respuesta404,
  respuestaError,
} from "@/lib/api";
import { query } from "@/lib/db";

const bodySchema = z.object({ estado: z.enum(ESTADOS_EXPEDIENTE) });

// Estado del expediente según carátula F-06 (historial append-only).
// «Listo para venta» es la única casilla que autoriza C-01/C-02.
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

  try {
    const existe = await query(`SELECT 1 FROM traza.expediente WHERE id = $1`, [id]);
    if (existe.rowCount === 0) return respuesta404("Expediente no encontrado");

    await query(
      `INSERT INTO traza.expediente_estado_hist (expediente_id, estado, registrado_por)
       VALUES ($1, $2, $3)`,
      [id, data.estado, usuario.id],
    );
    return NextResponse.json({ expedienteId: id, estado: data.estado }, { status: 201 });
  } catch (error) {
    return respuestaError(error);
  }
}

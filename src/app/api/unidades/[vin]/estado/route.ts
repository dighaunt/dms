import { NextResponse } from "next/server";
import { z } from "zod";

import {
  ESTADOS_UNIDAD,
  leerBody,
  requerirUsuario,
  requerirExpedienteEditable,
  respuesta404,
  respuestaError,
} from "@/lib/api";
import { query } from "@/lib/db";

const bodySchema = z.object({ hacia: z.enum(ESTADOS_UNIDAD) });

// Cambia el estado de la unidad vía traza.cambiar_estado_unidad: la máquina
// de estados y los candados viven en BD; sus errores salen como 409 con el
// mensaje literal (la UI los muestra tal cual: son las reglas del manual).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ vin: string }> },
) {
  const { usuario, error: authError } = await requerirUsuario();
  if (authError) return authError;

  const vin = (await params).vin.toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return respuesta404("Unidad no encontrada");

  const { data, error: bodyError } = await leerBody(request, bodySchema);
  if (bodyError) return bodyError;

  try {
    const existe = await query<{ expediente_id: number }>(
      `SELECT e.id AS expediente_id FROM traza.unidad u JOIN traza.expediente e ON e.vin = u.vin WHERE u.vin = $1`,
      [vin],
    );
    if (existe.rowCount === 0) return respuesta404("Unidad no encontrada");
    const cierreError = await requerirExpedienteEditable(existe.rows[0].expediente_id, usuario);
    if (cierreError) return cierreError;

    await query(`SELECT traza.cambiar_estado_unidad($1, $2, $3)`, [
      vin,
      data.hacia,
      usuario.id,
    ]);
    return NextResponse.json({ vin, estado: data.hacia }, { status: 201 });
  } catch (error) {
    return respuestaError(error);
  }
}

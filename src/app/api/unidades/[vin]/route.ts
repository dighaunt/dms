import { NextResponse } from "next/server";
import { z } from "zod";

import { leerBody, requerirUsuario, respuesta404, respuestaError } from "@/lib/api";
import { query } from "@/lib/db";

// Datos complementarios de la unidad (alimentan el prellenado de PDFs).
// Son datos maestros corregibles — a diferencia de folios e historial, que
// son append-only. VIN, marca, modelo y año NO se tocan: vienen de factura.
const bodySchema = z.object({
  color: z.string().trim().max(60).nullable(),
  numMotor: z.string().trim().max(60).nullable(),
  kilometraje: z.number().int().min(0).max(9_999_999).nullable(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ vin: string }> },
) {
  const { error: authError } = await requerirUsuario();
  if (authError) return authError;

  const { vin } = await params;
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return respuesta404("Unidad no encontrada");

  const { data, error: bodyError } = await leerBody(request, bodySchema);
  if (bodyError) return bodyError;

  try {
    const actualizado = await query(
      `UPDATE traza.unidad
          SET color = $2, num_motor = $3, kilometraje_ingreso = $4
        WHERE vin = $1`,
      [vin, data.color || null, data.numMotor || null, data.kilometraje],
    );
    if (actualizado.rowCount === 0) return respuesta404("Unidad no encontrada");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return respuestaError(error);
  }
}

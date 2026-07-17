import { NextResponse } from "next/server";
import { z } from "zod";

import { leerBody, requerirUsuario, respuesta404, respuestaError } from "@/lib/api";
import { query } from "@/lib/db";
import {
  LONGITUD_MAXIMA_DATO_UNIDAD,
  MAXIMO_KILOMETRAJE_UNIDAD,
  MAXIMO_ANIO_REFRENDO,
  MINIMO_ANIO_REFRENDO,
} from "@/lib/unidad";

// Datos complementarios de la unidad (alimentan el prellenado de PDFs).
// Son datos maestros corregibles — a diferencia de folios e historial, que
// son append-only. VIN, marca, modelo y año NO se tocan: vienen de factura.
const datoRequerido = z.string().trim().min(1).max(LONGITUD_MAXIMA_DATO_UNIDAD);

const bodySchema = z.object({
  color: datoRequerido,
  numMotor: datoRequerido,
  kilometraje: z.number().int().min(0).max(MAXIMO_KILOMETRAJE_UNIDAD),
  versionTipo: datoRequerido,
  placas: datoRequerido,
  entidadEmisora: datoRequerido,
  numeroFacturaVigente: datoRequerido,
  numeroConstanciaRepuve: datoRequerido,
  numeroTarjetaCirculacion: datoRequerido,
  refrendosAnio: z.number().int().min(MINIMO_ANIO_REFRENDO).max(MAXIMO_ANIO_REFRENDO),
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
          SET color = $2, num_motor = $3, kilometraje_ingreso = $4,
              version_tipo = $5, placas = $6, entidad_emisora = $7,
              numero_factura_vigente = $8, numero_constancia_repuve = $9,
              numero_tarjeta_circulacion = $10, refrendos_anio = $11
        WHERE vin = $1`,
      [
        vin,
        data.color,
        data.numMotor,
        data.kilometraje,
        data.versionTipo,
        data.placas,
        data.entidadEmisora,
        data.numeroFacturaVigente,
        data.numeroConstanciaRepuve,
        data.numeroTarjetaCirculacion,
        data.refrendosAnio,
      ],
    );
    if (actualizado.rowCount === 0) return respuesta404("Unidad no encontrada");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return respuestaError(error);
  }
}

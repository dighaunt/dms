import { NextResponse } from "next/server";
import { z } from "zod";

import { leerBody, parseId, requerirN3, respuesta404, respuestaError } from "@/lib/api";
import { query } from "@/lib/db";

const bodySchema = z.object({
  autorizar: z.boolean(),
  motivoRechazo: z.string().trim().min(10).optional(),
});

// Decisión de N3 sobre una solicitud de excepción documental legacy (modo riesgo).
// Si autoriza, traza.decidir_solicitud_riesgo declara la excepción en el mismo movimiento.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { usuario, error: authError } = await requerirN3(
    "Modo riesgo solo puede decidirlo un administrador global (N3)",
  );
  if (authError) return authError;

  const idSolicitud = parseId((await params).id);
  if (idSolicitud === null) return respuesta404("Solicitud no encontrada");

  const { data, error: bodyError } = await leerBody(request, bodySchema);
  if (bodyError) return bodyError;

  try {
    const resultado = await query(
      `SELECT * FROM traza.decidir_solicitud_riesgo($1, $2, $3, $4)`,
      [idSolicitud, data.autorizar, data.motivoRechazo ?? null, usuario.id],
    );
    const fila = resultado.rows[0];
    return NextResponse.json(
      { decisionId: Number(fila.id), autorizada: fila.autorizada },
      { status: 201 },
    );
  } catch (error) {
    return respuestaError(error);
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";

import {
  TIPOS_DOCUMENTO,
  formatearFolio,
  leerBody,
  parseId,
  requerirUsuario,
  respuesta404,
  respuestaError,
} from "@/lib/api";
import { query } from "@/lib/db";

const bodySchema = z.object({ tipo: z.enum(TIPOS_DOCUMENTO) });

// Emite un folio para el expediente. Los candados (regla de oro, contrato
// fuente, F-11) viven en traza.emitir_folio y se devuelven como 409.
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
    const doc = await query<{
      id: string;
      tipo_codigo: string;
      revision: string;
      anio: number;
      consecutivo: number;
    }>(`SELECT * FROM traza.emitir_folio($1, $2, $3)`, [data.tipo, id, usuario.id]);
    const d = doc.rows[0];
    return NextResponse.json(
      {
        documentoId: Number(d.id),
        tipo: d.tipo_codigo,
        revision: d.revision,
        folio: formatearFolio(d.tipo_codigo, d.anio, d.consecutivo),
      },
      { status: 201 },
    );
  } catch (error) {
    return respuestaError(error);
  }
}

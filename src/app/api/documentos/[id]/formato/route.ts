import { NextResponse } from "next/server";

import {
  formatearFolio,
  parseId,
  requerirUsuario,
  respuesta404,
  respuestaError,
} from "@/lib/api";
import { query } from "@/lib/db";
import { formatoPrellenado } from "@/lib/formatos-pdf";

// Descarga el PDF maestro del tipo de documento prellenado con el folio,
// el número de expediente y el VIN, listo para imprimir y completar a mano.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error: authError } = await requerirUsuario();
  if (authError) return authError;

  const id = parseId((await params).id);
  if (id === null) return respuesta404("Documento no encontrado");

  try {
    const res = await query<{
      tipo_codigo: string;
      anio: number;
      consecutivo: number;
      numero_expediente: string;
      vin: string;
    }>(
      `SELECT d.tipo_codigo, d.anio, d.consecutivo,
              e.anio::text || '-' || lpad(e.consecutivo::text, 3, '0') AS numero_expediente,
              e.vin
         FROM traza.documento d
         JOIN traza.expediente e ON e.id = d.expediente_id
        WHERE d.id = $1`,
      [id],
    );
    const doc = res.rows[0];
    if (!doc) return respuesta404("Documento no encontrado");

    const folio = formatearFolio(doc.tipo_codigo, doc.anio, doc.consecutivo);
    const pdf = await formatoPrellenado({
      tipo: doc.tipo_codigo,
      folio,
      numeroExpediente: doc.numero_expediente,
      vin: doc.vin,
    });

    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${folio}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return respuestaError(error);
  }
}

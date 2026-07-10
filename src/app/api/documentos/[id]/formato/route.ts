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

// Descarga el PDF maestro del tipo de documento prellenado con todo lo que
// el sistema sabe (folio, expediente, VIN, unidad, fechas, quién emitió),
// listo para imprimir y completar. El mapeo campo→dato vive en formatos-pdf.
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
      emitido_en: Date;
      emisor_nombre: string;
      numero_expediente: string;
      abierto_en: Date;
      vin: string;
      marca: string;
      modelo: string;
      anio_modelo: number;
      color: string | null;
      num_motor: string | null;
      kilometraje_ingreso: number | null;
    }>(
      `SELECT d.tipo_codigo, d.anio, d.consecutivo, d.emitido_en,
              us.nombre AS emisor_nombre,
              e.anio::text || '-' || lpad(e.consecutivo::text, 3, '0') AS numero_expediente,
              e.abierto_en, e.vin,
              ma.nombre AS marca, mo.nombre AS modelo,
              un.anio_modelo, un.color, un.num_motor, un.kilometraje_ingreso
         FROM traza.documento d
         JOIN traza.expediente e ON e.id = d.expediente_id
         JOIN traza.unidad un ON un.vin = e.vin
         JOIN traza.modelo mo ON mo.id = un.modelo_id
         JOIN traza.marca ma ON ma.id = mo.marca_id
         JOIN traza.usuario us ON us.id = d.emitido_por
        WHERE d.id = $1`,
      [id],
    );
    const doc = res.rows[0];
    if (!doc) return respuesta404("Documento no encontrado");

    const folio = formatearFolio(doc.tipo_codigo, doc.anio, doc.consecutivo);
    const pdf = await formatoPrellenado(doc.tipo_codigo, {
      folio,
      numeroExpediente: doc.numero_expediente,
      vin: doc.vin,
      marca: doc.marca,
      modelo: doc.modelo,
      anioModelo: doc.anio_modelo,
      color: doc.color,
      numMotor: doc.num_motor,
      kilometrajeIngreso: doc.kilometraje_ingreso,
      emisorNombre: doc.emisor_nombre,
      emitidoEn: new Date(doc.emitido_en),
      abiertoEn: new Date(doc.abierto_en),
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

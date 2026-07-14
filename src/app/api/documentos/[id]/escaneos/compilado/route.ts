import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";

import { parseId, requerirUsuario, respuesta404, respuestaError } from "@/lib/api";
import { query } from "@/lib/db";
import { leerBlob } from "@/lib/storage/presign";

// Une PDFs y fotografías JPEG/PNG en un único PDF de consulta. Los originales
// siguen inalterados en el Blob y conservan sus hashes/versiones individuales.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error: authError } = await requerirUsuario();
  if (authError) return authError;
  const id = parseId((await params).id);
  if (id === null) return respuesta404("Documento no encontrado");
  try {
    const archivos = await query<{ ruta_objeto: string }>(
      `SELECT ruta_objeto FROM traza.documento_adjunto WHERE documento_id = $1 ORDER BY subido_en, id`,
      [id],
    );
    if ((archivos.rowCount ?? 0) === 0) return respuesta404("No hay archivos para compilar");
    const salida = await PDFDocument.create();
    for (const archivo of archivos.rows) {
      const bytes = await leerBlob(archivo.ruta_objeto);
      if (!bytes) throw new Error("No se encontró uno de los archivos resguardados");
      const ruta = archivo.ruta_objeto.toLowerCase();
      if (ruta.endsWith(".pdf")) {
        const origen = await PDFDocument.load(bytes);
        const paginas = await salida.copyPages(origen, origen.getPageIndices());
        paginas.forEach((pagina) => salida.addPage(pagina));
      } else if (ruta.endsWith(".jpg") || ruta.endsWith(".jpeg")) {
        const imagen = await salida.embedJpg(bytes);
        const pagina = salida.addPage([imagen.width, imagen.height]);
        pagina.drawImage(imagen, { x: 0, y: 0, width: imagen.width, height: imagen.height });
      } else if (ruta.endsWith(".png")) {
        const imagen = await salida.embedPng(bytes);
        const pagina = salida.addPage([imagen.width, imagen.height]);
        pagina.drawImage(imagen, { x: 0, y: 0, width: imagen.width, height: imagen.height });
      } else {
        return NextResponse.json({ error: "WEBP puede consultarse por separado, pero no compilarse todavía a PDF." }, { status: 409 });
      }
    }
    const pdf = await salida.save();
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=escaneos-documento.pdf",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return respuestaError(error);
  }
}

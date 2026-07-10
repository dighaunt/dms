import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// Estampa folio, expediente y VIN sobre el PDF maestro del formato
// (public/formatos/<código>.pdf). Los PDFs no tienen campos de formulario,
// así que se dibuja texto en el encabezado (medido con pdfplumber, carta
// 612×792, idéntico en todos los documentos de cada categoría):
// - Formatos F: cajas de llenado — folio en x 472–574 / top 46–58,
//   expediente+VIN en la caja inferior x 446–576 / top 74–86.
// - Contratos C: sin cajas; el valor va en línea con la etiqueta
//   («Folio:» termina en x=463.7, «…VIN:» en x=499.1, bottoms 57.3/74.3).
type Campo = { x: number; y: number; max: number; size: number };
const POSICIONES: Record<"F" | "C", { folio: Campo; expVin: Campo }> = {
  F: {
    folio: { x: 475, y: 792 - 58 + 3.5, max: 571, size: 7 },
    expVin: { x: 449, y: 792 - 86 + 3.5, max: 573, size: 7 },
  },
  C: {
    folio: { x: 467.5, y: 792 - 56.3, max: 576, size: 6.5 },
    expVin: { x: 503, y: 792 - 73.3, max: 576, size: 6.5 },
  },
};

const TINTA = rgb(0.15, 0.15, 0.42); // índigo oscuro, se distingue del negro impreso

export async function formatoPrellenado({
  tipo,
  folio,
  numeroExpediente,
  vin,
}: {
  tipo: string;
  folio: string;
  numeroExpediente: string;
  vin: string;
}): Promise<Uint8Array> {
  const ruta = path.join(process.cwd(), "public", "formatos", `${tipo}.pdf`);
  const doc = await PDFDocument.load(await readFile(ruta));
  const fuente = await doc.embedFont(StandardFonts.HelveticaBold);
  const pos = POSICIONES[tipo.startsWith("C") ? "C" : "F"];
  const expVin = `${numeroExpediente} · ${vin}`;

  // El encabezado se repite en todas las páginas (contratos de 2 páginas).
  for (const page of doc.getPages()) {
    dibujarAjustado(page, fuente, folio, pos.folio);
    dibujarAjustado(page, fuente, expVin, pos.expVin);
  }

  doc.setTitle(`${folio} · ${numeroExpediente}`);
  return doc.save();
}

// Dibuja el texto reduciendo la fuente hasta que quepa antes del borde derecho.
function dibujarAjustado(
  page: import("pdf-lib").PDFPage,
  fuente: import("pdf-lib").PDFFont,
  texto: string,
  { x, y, max, size }: Campo,
) {
  while (size > 4 && x + fuente.widthOfTextAtSize(texto, size) > max) {
    size -= 0.25;
  }
  page.drawText(texto, { x, y, size, font: fuente, color: TINTA });
}

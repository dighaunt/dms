import "server-only";

import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";

const TEXTO = "PARA CONSULTA INTERNA · SIN VALIDEZ";

export async function conMarcaAgua(
  bytes: Uint8Array,
  contentType: string,
): Promise<Uint8Array> {
  let doc: PDFDocument;
  if (contentType === "application/pdf") {
    doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  } else {
    doc = await PDFDocument.create();
    const imagen =
      contentType === "image/png"
        ? await doc.embedPng(bytes)
        : await doc.embedJpg(bytes);
    const page = doc.addPage([imagen.width, imagen.height]);
    page.drawImage(imagen, { x: 0, y: 0, width: imagen.width, height: imagen.height });
  }

  const fuente = await doc.embedFont(StandardFonts.HelveticaBold);
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    
    const size = Math.max(9, Math.min(width, height) / 48);
    const ancho = fuente.widthOfTextAtSize(TEXTO, size);
    const pasoX = ancho + size * 6;
    const pasoY = size * 11;
    let fila = 0;
    for (let y = -height * 0.3; y < height * 1.3; y += pasoY, fila += 1) {
      const desfase = (fila % 2) * (pasoX / 2); 
      for (let x = -ancho; x < width + ancho; x += pasoX) {
        page.drawText(TEXTO, {
          x: x + desfase,
          y,
          size,
          font: fuente,
          rotate: degrees(35),
          color: rgb(0.45, 0.45, 0.5),
          opacity: 0.22,
        });
      }
    }
  }

  return doc.save();
}

import "server-only";

import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";

// Marca de agua para consulta de documentos delicados (facturas, INE…):
// «PARA CONSULTA INTERNA · SIN VALIDEZ» en diagonales pequeñas y tenues que
// no impiden leer el documento. El original en el store queda intacto; la
// marca se aplica al vuelo al servir la consulta. Imágenes (jpg/png) se
// envuelven en una página PDF del mismo tamaño y se marcan igual.

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
    // Tamaño relativo a la página: discreto en carta, proporcional en escaneos grandes.
    const size = Math.max(9, Math.min(width, height) / 48);
    const ancho = fuente.widthOfTextAtSize(TEXTO, size);
    const pasoX = ancho + size * 6;
    const pasoY = size * 11;
    let fila = 0;
    for (let y = -height * 0.3; y < height * 1.3; y += pasoY, fila += 1) {
      const desfase = (fila % 2) * (pasoX / 2); // tresbolillo para cubrir huecos
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

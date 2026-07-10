import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { PDFDocument } from "pdf-lib";

// Prellena el PDF maestro del formato (public/formatos/<código>.pdf).
// Los maestros son PDFs rellenables (AcroForm, separados del paquete
// conservando sus campos): el encabezado de cada documento tiene un campo
// de folio y uno de expediente/VIN — aquí van sus nombres, tomados del
// paquete original (contratos con nombre semántico, formatos con t-número).
// En contratos de 2 páginas el campo se comparte entre páginas, así que un
// solo setText llena ambos encabezados. El resto de campos queda editable.
const CAMPOS: Record<string, { folio: string; expVin: string }> = {
  "F-01": { folio: "t0001", expVin: "t0002" },
  "F-02": { folio: "t0038", expVin: "t0039" },
  "F-03": { folio: "t0069", expVin: "t0070" },
  "F-04": { folio: "t0094", expVin: "t0095" },
  "F-05": { folio: "t0115", expVin: "t0116" },
  "F-06": { folio: "t0136", expVin: "t0137" },
  "F-07": { folio: "t0186", expVin: "t0187" },
  "F-08": { folio: "t0233", expVin: "t0234" },
  "F-09": { folio: "t0269", expVin: "t0270" },
  "F-10": { folio: "t0325", expVin: "t0326" },
  "F-11": { folio: "t0371", expVin: "t0372" },
  "C-01": { folio: "C01_folio_1", expVin: "C01_vin_2" },
  "C-02": { folio: "C02_folio_33", expVin: "C02_vin_34" },
  "C-03": { folio: "C03_folio_74", expVin: "C03_vin_75" },
  "C-04": { folio: "C04_folio_115", expVin: "C04_vin_116" },
};

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
  const campos = CAMPOS[tipo];
  if (!campos) throw new Error(`Tipo documental sin campos mapeados: ${tipo}`);

  const ruta = path.join(process.cwd(), "public", "formatos", `${tipo}.pdf`);
  const doc = await PDFDocument.load(await readFile(ruta));
  const form = doc.getForm();

  form.getTextField(campos.folio).setText(folio);
  form.getTextField(campos.expVin).setText(`${numeroExpediente} · ${vin}`);

  doc.setTitle(`${folio} · ${numeroExpediente}`);
  return doc.save();
}

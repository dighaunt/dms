import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { PDFDocument } from "pdf-lib";

import type { PlantillaFormulario } from "@/lib/formularios/catalogo";
import { valorCerradoParaPdf } from "@/lib/formularios/presentacion";

/**
 * Escribe el snapshot completo del wizard sobre el AcroForm oficial.
 * No aplana el documento ni recrea campos: conserva nombres, widgets y las
 * acciones JavaScript originales para que el archivo siga siendo auditable y
 * compatible con Acrobat.
 */
export async function renderizarFormularioPdf({
  tipo,
  titulo,
  template,
  values,
}: {
  tipo: string;
  titulo: string;
  template: PlantillaFormulario;
  values: Record<string, string>;
}): Promise<Uint8Array> {
  const ruta = path.join(process.cwd(), "public", "formatos", `${tipo}.pdf`);
  const doc = await PDFDocument.load(await readFile(ruta));
  const form = doc.getForm();

  for (const field of template.fields) {
    const raw = values[field.name];
    if (raw == null || raw.trim() === "") {
      throw new Error(`El campo PDF ${field.name} no tiene un valor resuelto`);
    }

    if (field.acroType === "Tx") {
      form.getTextField(field.name).setText(valorCerradoParaPdf(field, raw));
      continue;
    }
    if (field.inputType === "boolean") {
      const checkbox = form.getCheckBox(field.name);
      if (raw === "SI") checkbox.check();
      else checkbox.uncheck();
      continue;
    }
    form.getRadioGroup(field.name).select(raw);
  }

  doc.setTitle(titulo);
  doc.setSubject(`Documento ${tipo} generado desde captura validada`);
  doc.setProducer("Kuentra DMS - motor documental");
  return doc.save({ updateFieldAppearances: true });
}

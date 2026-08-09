import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFRef,
  PDFString,
} from "pdf-lib";

import type { PlantillaFormulario } from "@/lib/formularios/catalogo";
import { valorCerradoParaPdf } from "@/lib/formularios/presentacion";

const NOMBRE_PARENT = PDFName.of("Parent");
const NOMBRE_CAMPO = PDFName.of("T");

function registrarWidgetsHuerfanos(
  doc: PDFDocument,
  template: PlantillaFormulario,
): void {
  const form = doc.getForm();
  const esperados = new Set(template.fields.map((field) => field.name));
  const registrados = new Set(form.getFields().map((field) => field.getName()));

  for (const page of doc.getPages()) {
    for (const annotationRef of page.node.Annots()?.asArray() ?? []) {
      const widget = doc.context.lookup(annotationRef, PDFDict);
      const parent = widget.get(NOMBRE_PARENT);
      const field =
        parent instanceof PDFRef
          ? doc.context.lookup(parent, PDFDict)
          : parent instanceof PDFDict
            ? parent
            : widget;
      const name = field.lookupMaybe(NOMBRE_CAMPO, PDFString, PDFHexString)?.decodeText();

      if (!name || !esperados.has(name) || registrados.has(name)) continue;

      const fieldRef =
        parent instanceof PDFRef
          ? parent
          : doc.context.getObjectRef(field) ?? annotationRef;
      if (!(fieldRef instanceof PDFRef)) {
        throw new Error(`No se pudo registrar el campo PDF ${name}`);
      }

      form.acroForm.addField(fieldRef);
      registrados.add(name);
    }
  }
}

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
  registrarWidgetsHuerfanos(doc, template);
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

#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/*
 * Comprueba el contrato entre los PDF oficiales y el wizard.
 *
 * No usa `PdfReader.get_fields()`: algunos PDFs pueden tener widgets en
 * /Annots cuyo parent no fue incluido en /AcroForm/Fields. Esos widgets sí se
 * ven en el PDF, pero pdf-lib no puede escribirlos y el capturista jamás los
 * recibe. Por eso el inventario parte de cada anotación de cada página.
 *
 * Uso: node scripts/auditar-contrato-pdf.cjs
 */

const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { PDFDocument, PDFName } = require("pdf-lib");

const ROOT = path.resolve(__dirname, "..");
const PDF_DIR = path.join(ROOT, "public", "formatos");
const catalogoGenerado = require(path.join(ROOT, "src", "lib", "formularios", "catalogo-generado.json"));

// El catálogo operativo es TypeScript. Se carga aquí sin iniciar Next ni la BD
// para verificar las reglas, tipos y fuentes que verá el diálogo real.
const resolveOriginal = Module._resolveFilename;
Module._resolveFilename = function resolverAlias(request, parent, ...args) {
  if (request.startsWith("@/")) {
    return resolveOriginal.call(this, path.join(ROOT, "src", request.slice(2)), parent, ...args);
  }
  return resolveOriginal.call(this, request, parent, ...args);
};
Module._extensions[".ts"] = function compilarTypescript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      resolveJsonModule: true,
    },
  }).outputText;
  module._compile(output, filename);
};

const cargarOriginal = Module._load;
Module._load = function cargarModulo(request, parent, isMain) {
  // La auditoría se ejecuta en Node y usa el renderer de servidor; no hay
  // frontera React que proteger en este proceso de verificación.
  if (request === "server-only") return {};
  return cargarOriginal.call(this, request, parent, isMain);
};

const { PLANTILLAS_FORMULARIO } = require(path.join(ROOT, "src", "lib", "formularios", "catalogo.ts"));
const { renderizarFormularioPdf } = require(path.join(ROOT, "src", "lib", "formatos-pdf.ts"));
const { monedaEnLetras } = require(path.join(ROOT, "src", "lib", "numeros.ts"));
const name = (value) => PDFName.of(value);
const lookup = (document, reference) => document.context.lookup(reference);
const text = (value) => value?.decodeText?.() ?? "";
const PUSHBUTTON = 1 << 16;
const HUERFANOS_CONOCIDOS_C01 = new Set([
  "c01_monto_num",
  "c01_monto_letra",
  "c01_forma_pago",
  "c01_precio_total",
  "c01_mkt",
]);

// Campos que no pueden depender del caption geométrico del extractor. Los
// cinco primeros estaban fuera de /AcroForm/Fields en C-01 y el texto cercano
// no describe el hueco. Este contrato evita volver a mostrar al capturista un
// label sin sentido o volver a pedir una firma de la empresa como texto libre.
const CONTRATOS_SEMANTICOS = {
  "C-01": {
    c01_monto_num: { label: "Monto del apartado", inputType: "number", source: "capture", required: true },
    c01_monto_letra: {
      label: "Monto del apartado con letra",
      inputType: "text",
      source: "derived",
      derivedFrom: "c01_monto_num",
      required: false,
    },
    c01_forma_pago: { label: "Forma de pago del apartado", inputType: "text", source: "capture", required: true },
    c01_precio_total: { label: "Precio total pactado de la unidad", inputType: "number", source: "capture", required: true },
    c01_mkt: { label: "Autoriza mercadotecnia", inputType: "radio", source: "capture", required: true, options: ["SI", "NO"] },
    C01_firma_31: { source: "system", systemToken: "empresaCliquealo" },
  },
  "C-02": {
    C02_firma_71: { source: "system", systemToken: "empresaCliquealo" },
  },
  "C-03": {
    C03_firma_113: { source: "system", systemToken: "empresaCliquealo" },
  },
  "C-04": {
    C04_firma_153: { source: "system", systemToken: "empresaCliquealo" },
  },
  "F-01": {
    t0036: { source: "system", systemToken: "empresaCliquealo" },
  },
  "F-02": {
    t0068: { source: "system", systemToken: "empresaCliquealo" },
  },
  "F-04": {
    t0113: { source: "system", systemToken: "empresaCliquealo" },
  },
  "F-11": {
    t0394: { source: "system", systemToken: "empresaCliquealo" },
  },
};

function datoDeWidget(document, widget) {
  let cursor = widget;
  let fieldName = "";
  let acroType = "";
  let flags;
  let maxLength;

  // Los atributos pueden residir en el widget o en cualquiera de sus parents.
  for (let depth = 0; cursor && depth < 8; depth += 1) {
    if (!fieldName) fieldName = text(cursor.get(name("T")));
    if (!acroType) acroType = String(cursor.get(name("FT")) ?? "").replace(/^\//, "");
    if (flags === undefined) flags = cursor.get(name("Ff"))?.asNumber?.();
    if (maxLength === undefined) maxLength = cursor.get(name("MaxLen"))?.asNumber?.();
    const parent = cursor.get(name("Parent"));
    cursor = parent ? lookup(document, parent) : null;
  }

  return {
    name: fieldName,
    acroType,
    flags: flags ?? 0,
    maxLength: maxLength ?? null,
  };
}

async function camposFisicos(pdfPath) {
  const document = await PDFDocument.load(fs.readFileSync(pdfPath));
  const fields = new Map();

  for (const [index, page] of document.getPages().entries()) {
    for (const reference of page.node.Annots()?.asArray?.() ?? []) {
      const field = datoDeWidget(document, lookup(document, reference));
      if (!field.name || !field.acroType) continue;
      if (field.acroType === "Btn" && (field.flags & PUSHBUTTON)) continue;
      const previous = fields.get(field.name) ?? { ...field, pages: [], widgets: 0 };
      previous.pages.push(index + 1);
      previous.widgets += 1;
      fields.set(field.name, previous);
    }
  }

  const reachable = new Set(document.getForm().getFields().map((field) => field.getName()));
  return { fields, reachable };
}

function diferencia(left, right) {
  return [...left].filter((value) => !right.has(value));
}

function lista(values) {
  return values.length === 0 ? "ninguno" : values.join(", ");
}

function valoresDePrueba(template) {
  const values = {};
  for (const field of template.fields) {
    if (field.acroType === "Btn") {
      values[field.name] = field.inputType === "boolean" ? "SI" : (field.options[0] ?? "SI");
      continue;
    }
    if (field.inputType === "number") values[field.name] = "12345.67";
    else if (field.inputType === "date") values[field.name] = "16/07/2026";
    else if (field.inputType === "time") values[field.name] = "12:30";
    else values[field.name] = "DATO DE PRUEBA";
  }

  Object.assign(values, {
    c01_monto_num: "15000.25",
    c01_monto_letra: monedaEnLetras("15000.25"),
    c01_forma_pago: "TRANSFERENCIA",
    c01_precio_total: "299900",
    c01_mkt: "SI",
  });
  return values;
}

async function verificarRenderer(problems) {
  for (const [code, template] of Object.entries(PLANTILLAS_FORMULARIO)) {
    const bytes = await renderizarFormularioPdf({
      tipo: code,
      titulo: `Prueba de integridad ${code}`,
      template,
      values: valoresDePrueba(template),
    });
    const output = await PDFDocument.load(bytes);
    const names = new Set(output.getForm().getFields().map((field) => field.getName()));
    const faltantes = template.fields
      .map((field) => field.name)
      .filter((fieldName) => !names.has(fieldName));
    if (faltantes.length) {
      problems.push(`${code}: el renderer no hizo escribibles: ${lista(faltantes)}.`);
    }

    if (code === "C-01") {
      const form = output.getForm();
      if (form.getTextField("c01_monto_num").getText() !== "15,000.25") {
        problems.push("C-01.c01_monto_num: el monto no se escribió con el formato esperado.");
      }
      if (!form.getTextField("c01_monto_letra").getText()?.startsWith(monedaEnLetras("15000.25"))) {
        problems.push("C-01.c01_monto_letra: el monto en letra no se escribió.");
      }
      if (!form.getTextField("c01_forma_pago").getText()?.startsWith("TRANSFERENCIA")) {
        problems.push("C-01.c01_forma_pago: la forma de pago no se escribió.");
      }
      if (form.getTextField("c01_precio_total").getText() !== "299,900") {
        problems.push("C-01.c01_precio_total: el precio total no se escribió con el formato esperado.");
      }
      if (form.getRadioGroup("c01_mkt").getSelected() !== "SI") {
        problems.push("C-01.c01_mkt: la autorización de mercadotecnia no se escribió.");
      }
    }
  }
}

async function main() {
  const problems = [];
  let totalActual = 0;
  let totalTexto = 0;

  for (const file of fs.readdirSync(PDF_DIR).filter((entry) => entry.endsWith(".pdf")).sort()) {
    const code = path.basename(file, ".pdf");
    const generated = catalogoGenerado.templates[code];
    const runtime = PLANTILLAS_FORMULARIO[code];
    if (!generated || !runtime) {
      problems.push(`${code}: falta la plantilla en el catálogo generado o en el catálogo operativo.`);
      continue;
    }

    const { fields: actual, reachable } = await camposFisicos(path.join(PDF_DIR, file));
    const actualNames = new Set(actual.keys());
    const generatedNames = new Set(generated.fields.map((field) => field.name));
    const runtimeNames = new Set(runtime.fields.map((field) => field.name));
    const faltanGenerado = diferencia(actualNames, generatedNames);
    const sobranGenerado = diferencia(generatedNames, actualNames);
    const faltanRuntime = diferencia(actualNames, runtimeNames);
    const sobranRuntime = diferencia(runtimeNames, actualNames);
    const huerfanos = diferencia(actualNames, reachable);
    totalActual += actualNames.size;

    console.log(
      `${code}: widgets PDF=${actualNames.size}, catálogo=${generatedNames.size}, diálogo=${runtimeNames.size}, árbol AcroForm=${reachable.size}`,
    );

    if (faltanGenerado.length) problems.push(`${code}: el catálogo generado omite: ${lista(faltanGenerado)}.`);
    if (sobranGenerado.length) problems.push(`${code}: el catálogo generado contiene campos inexistentes: ${lista(sobranGenerado)}.`);
    if (faltanRuntime.length) problems.push(`${code}: el diálogo omite: ${lista(faltanRuntime)}.`);
    if (sobranRuntime.length) problems.push(`${code}: el diálogo contiene campos inexistentes: ${lista(sobranRuntime)}.`);
    const orphanSet = new Set(huerfanos);
    const huerfanosEsperados =
      code === "C-01" &&
      huerfanos.length === HUERFANOS_CONOCIDOS_C01.size &&
      [...orphanSet].every((fieldName) => HUERFANOS_CONOCIDOS_C01.has(fieldName));
    if (huerfanos.length && !huerfanosEsperados) {
      problems.push(`${code}: widgets fuera de /AcroForm/Fields: ${lista(huerfanos)}.`);
    }

    for (const [fieldName, actualField] of actual) {
      if (actualField.acroType === "Tx") {
        totalTexto += 1;
        if (actualField.maxLength !== 100) {
          problems.push(
            `${code}.${fieldName}: /MaxLen=${actualField.maxLength ?? "ausente"}; el contrato oficial exige 100.`,
          );
        }
      }

      const runtimeField = runtime.fields.find((field) => field.name === fieldName);
      if (!runtimeField) continue;
      if (runtimeField.acroType !== actualField.acroType) {
        problems.push(
          `${code}.${fieldName}: tipo AcroForm ${actualField.acroType}, catálogo ${runtimeField.acroType}.`,
        );
      }
      const entradaEsBoton = ["boolean", "radio", "select"].includes(runtimeField.inputType);
      // F-06/F-07/F-08 usan campos de texto del PDF para representar listas
      // estrictas y sí/no. El renderer escribe "SI", "NO", etc. como texto,
      // por lo que Tx admite los tipos de UI. Un botón físico, en cambio,
      // sólo puede representarse como booleano, radio o selector.
      if (actualField.acroType === "Btn" && !entradaEsBoton) {
        problems.push(
          `${code}.${fieldName}: tipo de diálogo ${runtimeField.inputType} incompatible con ${actualField.acroType}.`,
        );
      }
      if (runtimeField.source === "derived" && !runtimeField.derivedFrom) {
        problems.push(`${code}.${fieldName}: está marcado como derivado sin campo de origen.`);
      }
    }

    for (const [fieldName, expected] of Object.entries(CONTRATOS_SEMANTICOS[code] ?? {})) {
      const field = runtime.fields.find((candidate) => candidate.name === fieldName);
      if (!field) {
        problems.push(`${code}.${fieldName}: falta el contrato semántico del diálogo.`);
        continue;
      }
      for (const [property, value] of Object.entries(expected)) {
        const actualValue = field[property];
        if (JSON.stringify(actualValue) !== JSON.stringify(value)) {
          problems.push(
            `${code}.${fieldName}: ${property}=${JSON.stringify(actualValue)}; se esperaba ${JSON.stringify(value)}.`,
          );
        }
      }
    }
  }

  await verificarRenderer(problems);

  console.log(`\nTotal: ${totalActual} campos operativos; ${totalTexto} textos con /MaxLen=100.`);
  console.log("C-01 conserva 5 widgets huérfanos en el archivo oficial; el renderer los registra en memoria antes de escribir.");
  if (problems.length === 0) {
    console.log("Contrato PDF ↔ catálogo ↔ diálogo íntegro.");
    return;
  }
  console.error(`\nDiscordancias (${problems.length}):`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

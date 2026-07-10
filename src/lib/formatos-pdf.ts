import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { PDFDocument } from "pdf-lib";

// Motor de formularios: prellena el PDF maestro (public/formatos/<código>.pdf)
// con todo lo que el sistema ya sabe. Los maestros son PDFs rellenables
// (AcroForm); cada tipo mapea nombre de campo → dato del sistema. Los campos
// restantes quedan editables (digital o a mano tras imprimir).
//
// Nombres de campo tomados del paquete original (contratos con nombre
// semántico C0x_*, formatos con t-números); el inventario campo→etiqueta se
// regenera con pdfplumber si llega una revisión nueva del paquete.

export type DatosExpediente = {
  folio: string;
  numeroExpediente: string;
  vin: string;
  marca: string;
  modelo: string;
  anioModelo: number;
  color: string | null;
  numMotor: string | null;
  kilometrajeIngreso: number | null;
  emisorNombre: string;
  emitidoEn: Date;
  abiertoEn: Date;
};

// Comprador/receptor cuando la contraparte es el propio lote (F-04).
const RAZON_SOCIAL = "COMERCIALIZADORA AUTOMOTRIZ CLIQUEALO DE MÉXICO S.R.L. DE C.V.";

type Token =
  | "folio"          // F-06-2026-0001
  | "expVin"         // 2026-001 · VIN (encabezado)
  | "numeroExpediente"
  | "vin"
  | "marcaSubmarca"  // NISSAN VERSA
  | "marcaSubmarcaAnio" // NISSAN VERSA / 2021
  | "anio"
  | "color"
  | "numMotor"
  | "kilometraje"    // odómetro al ingreso (día 0)
  | "fecha"          // fecha de emisión del folio, dd/mm/aa
  | "fechaApertura"  // apertura del expediente, dd/mm/aa
  | "emisor"         // nombre de quien emitió el folio
  | "compradorLote"; // razón social del lote

const CAMPOS: Record<string, Record<string, Token>> = {
  "F-01": { t0001: "folio", t0002: "expVin", t0003: "marcaSubmarca", t0004: "anio", t0005: "vin", t0006: "numMotor", t0007: "color", t0008: "kilometraje", t0012: "fecha" },
  "F-02": { t0038: "folio", t0039: "expVin", t0040: "marcaSubmarca", t0041: "anio", t0042: "vin", t0043: "numMotor", t0044: "color", t0045: "kilometraje" },
  "F-03": { t0069: "folio", t0070: "expVin" },
  "F-04": { t0094: "folio", t0095: "expVin", t0096: "folio", t0097: "fecha", t0100: "compradorLote", t0103: "marcaSubmarcaAnio", t0104: "vin", t0105: "numMotor" },
  "F-05": { t0115: "folio", t0116: "expVin", t0117: "marcaSubmarcaAnio", t0118: "vin", t0119: "kilometraje", t0120: "emisor", t0121: "fecha" },
  "F-06": { t0136: "folio", t0137: "expVin", t0138: "numeroExpediente", t0139: "vin", t0140: "fechaApertura", t0141: "marcaSubmarcaAnio", t0142: "emisor" },
  "F-07": { t0186: "folio", t0187: "expVin", t0188: "marcaSubmarcaAnio", t0189: "vin", t0227: "emisor", t0228: "fecha" },
  "F-08": { t0233: "folio", t0234: "expVin", t0235: "marcaSubmarcaAnio", t0236: "vin" },
  "F-09": { t0269: "folio", t0270: "expVin", t0271: "marcaSubmarcaAnio", t0272: "vin", t0273: "numeroExpediente" },
  "F-10": { t0325: "folio", t0326: "expVin", t0327: "numeroExpediente", t0328: "vin", t0329: "fecha" },
  "F-11": { t0371: "folio", t0372: "expVin", t0373: "folio", t0374: "vin", t0375: "fecha", t0376: "marcaSubmarcaAnio" },
  "C-01": { C01_folio_1: "folio", C01_vin_2: "expVin", C01_f_11: "fecha", C01_f_13: "marcaSubmarca", C01_f_15: "anio", C01_f_16: "color", C01_f_17: "kilometraje", C01_f_18: "vin", C01_f_19: "numMotor" },
  "C-02": { C02_folio_33: "folio", C02_vin_34: "expVin", C02_f_43: "fecha", C02_f_45: "marcaSubmarca", C02_f_47: "anio", C02_f_48: "color", C02_f_49: "kilometraje", C02_f_50: "vin", C02_f_51: "numMotor", C02_folio_69: "folio", C02_vin_70: "expVin" },
  "C-03": { C03_folio_74: "folio", C03_vin_75: "expVin", C03_f_84: "fecha", C03_f_86: "marcaSubmarca", C03_f_88: "anio", C03_f_89: "color", C03_f_90: "kilometraje", C03_f_91: "vin", C03_f_92: "numMotor", C03_folio_100: "folio", C03_vin_101: "expVin" },
  "C-04": { C04_folio_115: "folio", C04_vin_116: "expVin", C04_f_125: "fecha", C04_f_127: "marcaSubmarca", C04_f_129: "anio", C04_f_130: "color", C04_f_131: "kilometraje", C04_f_132: "vin", C04_f_133: "numMotor", C04_folio_142: "folio", C04_vin_143: "expVin" },
};

function fechaCorta(fecha: Date): string {
  // dd/mm/aa como piden los formatos, en horario del lote.
  return fecha.toLocaleDateString("es-MX", {
    timeZone: "America/Mexico_City",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

export async function formatoPrellenado(tipo: string, datos: DatosExpediente): Promise<Uint8Array> {
  const campos = CAMPOS[tipo];
  if (!campos) throw new Error(`Tipo documental sin campos mapeados: ${tipo}`);

  const valores: Record<Token, string | null> = {
    folio: datos.folio,
    expVin: `${datos.numeroExpediente} · ${datos.vin}`,
    numeroExpediente: datos.numeroExpediente,
    vin: datos.vin,
    marcaSubmarca: `${datos.marca} ${datos.modelo}`,
    marcaSubmarcaAnio: `${datos.marca} ${datos.modelo} / ${datos.anioModelo}`,
    anio: String(datos.anioModelo),
    color: datos.color,
    numMotor: datos.numMotor,
    kilometraje: datos.kilometrajeIngreso == null ? null : datos.kilometrajeIngreso.toLocaleString("es-MX"),
    fecha: fechaCorta(datos.emitidoEn),
    fechaApertura: fechaCorta(datos.abiertoEn),
    emisor: datos.emisorNombre,
    compradorLote: RAZON_SOCIAL,
  };

  const ruta = path.join(process.cwd(), "public", "formatos", `${tipo}.pdf`);
  const doc = await PDFDocument.load(await readFile(ruta));
  const form = doc.getForm();

  for (const [campo, token] of Object.entries(campos)) {
    const valor = valores[token];
    if (valor == null || valor === "") continue; // lo que no se sabe queda en blanco
    form.getTextField(campo).setText(valor);
  }

  doc.setTitle(`${datos.folio} · ${datos.numeroExpediente}`);
  return doc.save();
}

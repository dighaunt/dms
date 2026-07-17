import catalogoGenerado from "./catalogo-generado.json";

import { normalizarEtiquetaCampo, normalizarSeccion } from "./etiquetas";

export type TipoEntrada =
  | "text"
  | "textarea"
  | "email"
  | "tel"
  | "date"
  | "time"
  | "number"
  | "boolean"
  | "radio"
  | "select";

export type TokenSistema =
  | "folio"
  | "expVin"
  | "numeroExpediente"
  | "vin"
  | "marcaSubmarca"
  | "marcaSubmarcaAnio"
  | "anio"
  | "versionTipo"
  | "color"
  | "numMotor"
  | "kilometraje"
  | "placas"
  | "entidadEmisora"
  | "numeroFacturaVigente"
  | "numeroConstanciaRepuve"
  | "numeroTarjetaCirculacion"
  | "refrendosAnio"
  | "fecha"
  | "fechaApertura"
  | "emisor"
  | "empresaCliquealo"
  | "compradorLote"
  | "f06Incompleto"
  | "f06Completo"
  | "f06Listo";

type CampoGenerado = {
  name: string;
  label: string;
  section: string;
  page: number;
  acroType: "Tx" | "Btn";
  inputType: TipoEntrada;
  required: boolean;
  multiline: boolean;
  options: string[];
  scripts: Record<string, string>;
  widgets: Array<{ page: number; rect: [number, number, number, number] }>;
  order: number;
};

type PlantillaGenerada = {
  code: string;
  pages: number;
  fieldCount: number;
  sections: Array<{ id: string; label: string }>;
  fields: CampoGenerado[];
};

export type CampoFormulario = CampoGenerado & {
  source: "system" | "capture" | "derived";
  systemToken?: TokenSistema;
  derivedFrom?: string;
  reuseKey?: string;
  emptyValue?: string;
  help?: string;
  closeWithHyphens: boolean;
};

export type ReglaFormulario = {
  when: { field: string; equals: string };
  require?: string[];
  fill?: Record<string, string>;
};

export type PlantillaFormulario = Omit<PlantillaGenerada, "fields"> & {
  fields: CampoFormulario[];
  rules: ReglaFormulario[];
  choiceGroups: Array<{
    label: string;
    fields: string[];
    min: number;
    max: number;
  }>;
};

const CAMPOS_SISTEMA: Record<string, Record<string, TokenSistema>> = {
  "F-01": { t0001: "folio", t0002: "expVin", t0003: "marcaSubmarca", t0004: "anio", t0005: "vin", t0006: "numMotor", t0007: "color", t0008: "kilometraje", t0010: "placas", t0011: "entidadEmisora", t0012: "fecha", t0036: "empresaCliquealo" },
  "F-02": { t0038: "folio", t0039: "expVin", t0040: "marcaSubmarca", t0041: "anio", t0042: "vin", t0043: "numMotor", t0044: "color", t0045: "kilometraje", t0047: "placas", t0048: "entidadEmisora", t0068: "empresaCliquealo" },
  "F-03": { t0069: "folio", t0070: "expVin" },
  "F-04": { t0094: "folio", t0095: "expVin", t0096: "folio", t0097: "fecha", t0100: "compradorLote", t0103: "marcaSubmarcaAnio", t0104: "vin", t0105: "numMotor", t0113: "empresaCliquealo" },
  "F-05": { t0115: "folio", t0116: "expVin", t0117: "marcaSubmarcaAnio", t0118: "vin", t0119: "kilometraje", t0120: "emisor", t0121: "fecha" },
  "F-06": { t0136: "folio", t0137: "expVin", t0138: "numeroExpediente", t0139: "vin", t0140: "fechaApertura", t0141: "marcaSubmarcaAnio", t0142: "emisor", c0179: "f06Incompleto", c0180: "f06Completo", c0181: "f06Listo" },
  "F-07": { t0186: "folio", t0187: "expVin", t0188: "marcaSubmarcaAnio", t0189: "vin", t0227: "emisor", t0228: "fecha" },
  "F-08": { t0233: "folio", t0234: "expVin", t0235: "marcaSubmarcaAnio", t0236: "vin" },
  "F-09": { t0269: "folio", t0270: "expVin", t0271: "marcaSubmarcaAnio", t0272: "vin", t0273: "numeroExpediente" },
  "F-10": { t0325: "folio", t0326: "expVin", t0327: "numeroExpediente", t0328: "vin", t0329: "fecha" },
  "F-11": { t0371: "folio", t0372: "expVin", t0373: "folio", t0374: "vin", t0375: "fecha", t0376: "marcaSubmarcaAnio", t0394: "empresaCliquealo" },
  "C-01": { C01_folio_1: "folio", C01_vin_2: "expVin", C01_f_11: "fecha", C01_f_13: "marcaSubmarca", C01_f_14: "versionTipo", C01_f_15: "anio", C01_f_16: "color", C01_f_17: "kilometraje", C01_f_18: "vin", C01_f_19: "numMotor", C01_f_20: "placas", C01_f_21: "entidadEmisora", C01_f_22: "numeroFacturaVigente", C01_f_23: "numeroConstanciaRepuve", C01_f_24: "numeroTarjetaCirculacion", C01_f_25: "refrendosAnio", C01_firma_31: "empresaCliquealo" },
  "C-02": { C02_folio_33: "folio", C02_vin_34: "expVin", C02_f_43: "fecha", C02_f_45: "marcaSubmarca", C02_f_46: "versionTipo", C02_f_47: "anio", C02_f_48: "color", C02_f_49: "kilometraje", C02_f_50: "vin", C02_f_51: "numMotor", C02_f_52: "placas", C02_f_53: "entidadEmisora", C02_f_54: "numeroFacturaVigente", C02_f_55: "numeroConstanciaRepuve", C02_f_56: "numeroTarjetaCirculacion", C02_f_57: "refrendosAnio", C02_folio_69: "folio", C02_vin_70: "expVin", C02_firma_71: "empresaCliquealo" },
  "C-03": { C03_folio_74: "folio", C03_vin_75: "expVin", C03_f_84: "fecha", C03_f_86: "marcaSubmarca", C03_f_87: "versionTipo", C03_f_88: "anio", C03_f_89: "color", C03_f_90: "kilometraje", C03_f_91: "vin", C03_f_92: "numMotor", C03_f_93: "placas", C03_f_94: "entidadEmisora", C03_f_95: "numeroFacturaVigente", C03_f_96: "numeroConstanciaRepuve", C03_f_97: "numeroTarjetaCirculacion", C03_f_98: "refrendosAnio", C03_folio_100: "folio", C03_vin_101: "expVin", C03_firma_113: "empresaCliquealo" },
  "C-04": { C04_folio_115: "folio", C04_vin_116: "expVin", C04_f_125: "fecha", C04_f_127: "marcaSubmarca", C04_f_128: "versionTipo", C04_f_129: "anio", C04_f_130: "color", C04_f_131: "kilometraje", C04_f_132: "vin", C04_f_133: "numMotor", C04_f_134: "placas", C04_f_135: "entidadEmisora", C04_f_136: "numeroFacturaVigente", C04_f_137: "numeroConstanciaRepuve", C04_f_138: "numeroTarjetaCirculacion", C04_f_139: "refrendosAnio", C04_folio_142: "folio", C04_vin_143: "expVin", C04_firma_153: "empresaCliquealo" },
};

const DERIVADOS: Record<string, Record<string, string>> = {
  "F-04": { t0107: "t0106" },
  "C-01": { c01_monto_letra: "c01_monto_num" },
  "C-02": { c02_precio_letra: "c02_precio_num" },
  "C-03": { c03_precio_letra: "c03_precio_num" },
};

const OVERRIDES: Record<string, Record<string, Partial<CampoFormulario>>> = {
  // C-01: huecos en línea dentro de las cláusulas impresas. El caption que
  // extrae el script toma palabras vecinas; aquí va el significado real
  // verificado contra el texto de cada cláusula del PDF.
  "C-01": {
    c01_monto_num: {
      label: "Monto del apartado",
      inputType: "number",
      order: 20,
      help: "Cláusula segunda: importe entregado para reservar la unidad.",
    },
    c01_monto_letra: {
      label: "Monto del apartado con letra",
      inputType: "text",
      closeWithHyphens: true,
      help: "Se calcula automáticamente a partir del monto del apartado.",
    },
    c01_forma_pago: {
      label: "Forma de pago del apartado",
      help: "Cláusula segunda: por ejemplo, transferencia, tarjeta o cheque.",
    },
    c01_precio_total: {
      label: "Precio total pactado de la unidad",
      inputType: "number",
      order: 21,
      reuseKey: "operacion.precio_total",
      help: "Cláusula segunda: precio que el vendedor respetará durante la vigencia.",
    },
    c01_mkt: { label: "Autoriza mercadotecnia", options: ["SI", "NO"] },
    C01_inl_26: {
      label: "Vencimiento del apartado",
      inputType: "date",
      closeWithHyphens: false,
      help: "Cláusula tercera: fecha en que vence la vigencia del apartado.",
    },
    C01_inl_27: {
      label: "Prórroga - hasta el día",
      inputType: "date",
      required: false,
      emptyValue: "NO APLICA",
      closeWithHyphens: false,
      help: "Sólo si las partes acuerdan por escrito la prórroga única.",
    },
    C01_inl_28: {
      label: "Prórroga - iniciales del vendedor",
      inputType: "text",
      required: false,
      emptyValue: "NO APLICA",
    },
    C01_inl_29: {
      label: "Prórroga - iniciales del interesado",
      inputType: "text",
      required: false,
      emptyValue: "NO APLICA",
    },
    C01_inl_30: {
      label: "Pena por desistimiento (% del apartado)",
      inputType: "number",
      order: 22,
      help: "Se calcula sobre el monto del apartado ya capturado; el sistema aplica el tope de la obligación principal.",
    },
  },
  "F-01": {
    c0015: { label: "Origen - particular" },
    c0016: { label: "Origen - agencia o distribuidor" },
    c0017: { label: "Origen - empresa o flotilla" },
    c0018: { label: "Origen - subasta" },
    c0019: { label: "Origen - otro" },
    t0013: { inputType: "number" },
    t0020: { label: "Especifique otro origen" },
    t0035: { label: "Especifique otro documento entregado" },
  },
  "F-02": {
    t0051: { inputType: "number" },
    t0066: { label: "Especifique otro documento entregado" },
  },
  "F-03": {
    c0071: { label: "Rol - vendedor" },
    c0072: { label: "Rol - consignante" },
    c0073: { label: "Rol - comprador" },
    c0074: { label: "Tipo - persona física" },
    c0075: { label: "Tipo - persona moral" },
    t0084: { label: "Tipo de identificación", help: "INE, pasaporte u otra identificación oficial." },
    t0085: { label: "Número de identificación" },
    t0090: { required: false },
  },
  "F-05": {
    t0132: { label: "Especifique otro accesorio o documento" },
  },
  "F-10": {
    t0338: { label: "Especifique otro elemento en resguardo" },
  },
  "F-11": {
    t0387: { label: "Especifique otro documento entregado" },
  },
  "C-02": {
    c02_gar: {
      label: "Garantía contractual",
      help: "La respuesta activa únicamente los datos de cobertura que correspondan; el resto se resuelve automáticamente.",
    },
    c02_gar_dias: { label: "Garantía - días", inputType: "number" },
    c02_gar_km: { label: "Garantía - kilómetros", inputType: "number" },
    c02_gar_cubre: { label: "Garantía - cobertura" },
    c02_mkt: { label: "Autoriza mercadotecnia" },
    c02_pub: { label: "Autoriza publicidad en redes" },
    c02_precio_letra: { label: "Precio con letra", inputType: "text", closeWithHyphens: true },
    c02_precio_num: { label: "Precio total pactado", inputType: "number", reuseKey: "operacion.precio_total" },
    C02_otro_68: { label: "Especifique otro documento entregado" },
  },
  "C-03": {
    c03_precio_letra: { label: "Precio con letra", inputType: "text", closeWithHyphens: true },
    C03_otro_111: { label: "Especifique otro documento entregado" },
  },
  "C-04": {
    c04_modalidad: {
      label: "Modalidad de acondicionamiento",
      options: ["OP1", "OP2"],
      help: "OP1: costo a cargo del consignante. OP2: costo a cargo del consignatario.",
    },
    c04_seg: {
      label: "Responsable del seguro",
      help: "Elija consignante, consignatario o sin seguro.",
    },
    c04_poliza: { label: "Número de póliza" },
    C04_inl_144: {
      label: "Pena por desistimiento (% del precio estimado)",
      inputType: "number",
      help: "Cláusula séptima: porcentaje del precio estimado de venta como pena convencional recíproca.",
    },
    c04_mkt: { label: "Autoriza mercadotecnia" },
    C04_f_140: { label: "Retribución del consignatario" },
    C04_f_141: { label: "Vigencia en días naturales", inputType: "number" },
    C04_otro_151: { label: "Especifique otro documento entregado" },
  },
  "F-04": {
    t0106: { inputType: "number" },
    t0107: { label: "Importe con letra", inputType: "text", closeWithHyphens: true },
  },
};

const RULES: Record<string, ReglaFormulario[]> = {
  "F-03": [
    {
      // Persona física: CURP obligatoria; el apartado de representante /
      // beneficiario (sólo persona moral) se anula.
      when: { field: "c0074", equals: "SI" },
      require: ["t0079"],
      fill: { t0090: "NO APLICA", t0091: "NO APLICA" },
    },
    {
      // Persona moral: exige representante / apoderado; la CURP se anula.
      when: { field: "c0075", equals: "SI" },
      require: ["t0090"],
      fill: { t0079: "NO APLICA" },
    },
  ],
  "F-08": [
    {
      // Resultado "con observaciones": las observaciones dejan de ser opcionales.
      when: { field: "c0265", equals: "SI" },
      require: ["t0266"],
    },
  ],
  "C-02": [
    {
      when: { field: "c02_gar", equals: "SIN" },
      fill: {
        c02_gar_dias: "NO APLICA",
        c02_gar_km: "NO APLICA",
        c02_gar_cubre: "NO APLICA",
      },
    },
    {
      when: { field: "c02_gar", equals: "CON" },
      require: ["c02_gar_dias", "c02_gar_km", "c02_gar_cubre"],
    },
  ],
  "C-04": [
    {
      when: { field: "c04_seg", equals: "SIN" },
      fill: { c04_poliza: "NO APLICA" },
    },
    {
      when: { field: "c04_seg", equals: "CONSIGNANTE" },
      require: ["c04_poliza"],
    },
    {
      when: { field: "c04_seg", equals: "CONSIGNATARIO" },
      require: ["c04_poliza"],
    },
  ],
};

const CHOICE_GROUPS: Record<string, PlantillaFormulario["choiceGroups"]> = {
  "F-01": [
    { label: "Origen de la unidad", fields: ["c0015", "c0016", "c0017", "c0018", "c0019"], min: 1, max: 1 },
  ],
  "F-02": [
    { label: "Estado de acondicionamiento", fields: ["c0049", "c0050"], min: 1, max: 1 },
  ],
  "F-03": [
    { label: "Rol de la contraparte", fields: ["c0071", "c0072", "c0073"], min: 1, max: 1 },
    { label: "Tipo de persona", fields: ["c0074", "c0075"], min: 1, max: 1 },
  ],
  "F-08": [
    { label: "Resultado de validación", fields: ["c0264", "c0265"], min: 1, max: 1 },
  ],
  "F-07": Array.from({ length: 7 }, (_, index) => {
    const start = 192 + index * 5;
    const labels = [
      "Tenencias",
      "Refrendo",
      "Infracciones o multas",
      "Verificación vehicular",
      "Gravamen sobre factura",
      "Reporte de robo",
      "Otros adeudos",
    ];
    return {
      label: labels[index],
      fields: [`t0${start}`, `t0${start + 1}`],
      min: 1,
      max: 1,
    };
  }),
};

const PARTY_FIELD = [
  ["NOMBRE", "nombre"],
  ["RAZÓN SOCIAL", "nombre"],
  ["RFC", "rfc"],
  ["CURP", "curp"],
  ["DOMICILIO", "domicilio"],
  ["TELÉFONO", "telefono"],
  ["CORREO", "correo"],
  ["IDENTIFICACIÓN", "identificacion"],
] as const;

function partyRole(code: string): string | null {
  if (["C-01", "C-02", "F-11"].includes(code)) return "comprador";
  if (["C-03", "C-04", "F-01", "F-02", "F-03", "F-04"].includes(code)) {
    return "contraparte_origen";
  }
  return null;
}

function reuseKey(code: string, label: string): string | undefined {
  const role = partyRole(code);
  if (!role) return undefined;
  const upper = label.toUpperCase();
  const match = PARTY_FIELD.find(([fragment]) => upper.includes(fragment));
  return match ? `parte.${role}.${match[1]}` : undefined;
}

function isOtherDetail(name: string, label: string): boolean {
  return /otro/i.test(name) || /\bOTRO\b/i.test(label);
}

// En las tablas del PDF (F-06, F-07, F-09) sólo la primera columna de cada
// fila trae el concepto; celdas como "OBSERVACIONES" o "COSTO" llegan sueltas.
// Se les antepone el concepto de su fila para que la etiqueta sea inequívoca.
const COLUMNA_SUELTA =
  /^(OBSERVACIONES|COSTO|RESPONSABLE|FUENTE|FECHA CORTE|FOLIO\s*\/?\s*REF\.?|ORIG\.?\s*\/?\s*COPIA)$/i;
const FILA_CON_CONCEPTO =
  /^(.{3,70}?)\s+[-—]\s+(PRESENTE|ORIG|ESTADO|SIN ADEUDO|CON ADEUDO|MONTO)/;

// Los 471 campos de texto del AcroForm oficial tienen /MaxLen 100. El ancho
// del widget no es un límite de datos: Acrobat ajusta la fuente automáticamente
// (su apariencia usa tamaño 0).
const LONGITUD_MAXIMA_TEXTO_PDF = 100;

// Contrato de almacenamiento de traza.{expediente_dato,documento_campo_valor}.
// numeric(18,2) admite hasta 16 enteros y 2 decimales; kilometraje_ingreso
// es integer de PostgreSQL, no un texto limitado por el ancho del PDF.
export const DIGITOS_ENTEROS_MAXIMOS_NUMERO = 16;
export const DECIMALES_MAXIMOS_NUMERO = 2;
export const MAXIMO_KILOMETRAJE = 2_147_483_647;

function etiquetasConContextoDeFila(fields: CampoGenerado[]): Map<string, string> {
  const result = new Map<string, string>();
  let concepto: string | null = null;
  let seccion = "";
  for (const raw of fields) {
    if (raw.section !== seccion) {
      concepto = null;
      seccion = raw.section;
    }
    const fila = FILA_CON_CONCEPTO.exec(raw.label);
    if (fila) concepto = fila[1];
    if (concepto && COLUMNA_SUELTA.test(raw.label.trim())) {
      result.set(raw.name, `${concepto} - ${raw.label.trim()}`);
    }
  }
  return result;
}

function buildTemplate(template: PlantillaGenerada): PlantillaFormulario {
  const system = CAMPOS_SISTEMA[template.code] ?? {};
  const derived = DERIVADOS[template.code] ?? {};
  const contextual = etiquetasConContextoDeFila(template.fields);

  const fields = template.fields.map((raw): CampoFormulario => {
    const rawLabel = contextual.get(raw.name) ?? raw.label;
    const systemToken = system[raw.name];
    const derivedFrom = derived[raw.name];
    // Sólo los campos de texto se anulan con NO APLICA / SIN OBSERVACIONES;
    // un checkbox vacío ya se resuelve como NO.
    const isObservations =
      raw.acroType === "Tx" && /OBSERVACIONES|RESOLUCIÓN|DAÑOS|PENDIENTES/i.test(rawLabel);
    const conditionalByLabel =
      raw.acroType === "Tx" &&
      /SI APLICA|SI SE CUENTA|SI CORRESPONDE|PERSONA FÍSICA/i.test(rawLabel);
    // El OTRO debe estar fuera de paréntesis: "(INE/pasaporte/otro)" describe
    // opciones del dato, no un campo de detalle de "Otro".
    const otherDetail =
      raw.acroType === "Tx" && isOtherDetail(raw.name, rawLabel.replace(/\([^)]*\)/g, ""));
    const override = OVERRIDES[template.code]?.[raw.name] ?? {};
    const inputType = raw.acroType === "Tx"
      ? /\bHORA\b/i.test(rawLabel)
        ? "time"
        : /TELÉFONO|TELEFONO/i.test(rawLabel)
          ? "tel"
          : /CORREO/i.test(rawLabel)
            ? "email"
            : /FECHA/i.test(rawLabel) && !/FIRMA|OBSERV/i.test(rawLabel)
              ? "date"
              : raw.inputType
      : raw.inputType;
    const field: CampoFormulario = {
      ...raw,
      label: rawLabel,
      source: systemToken ? "system" : derivedFrom ? "derived" : "capture",
      systemToken,
      derivedFrom,
      reuseKey: systemToken || derivedFrom ? undefined : reuseKey(template.code, rawLabel),
      inputType,
      required:
        systemToken || derivedFrom || otherDetail || isObservations || conditionalByLabel
          ? false
          : raw.required,
      emptyValue: otherDetail
        ? "NO APLICA"
        : isObservations
          ? "SIN OBSERVACIONES"
          : conditionalByLabel
            ? "NO APLICA"
            : undefined,
      closeWithHyphens:
        raw.acroType === "Tx" &&
        !["date", "number", "email", "tel", "time"].includes(inputType) &&
        !systemToken,
      ...override,
    };
    // Los overrides ya vienen redactados; el resto se limpia del caption crudo.
    if (!override.label) {
      const { label, hint } = normalizarEtiquetaCampo(field.label);
      field.label = label;
      if (hint && !field.help) field.help = hint;
    }
    if (field.systemToken === "folio") field.label = "Folio";
    return field;
  });

  // F-06 trae una tabla de texto, no checkboxes. La UI usa tipos estrictos y
  // el renderer escribe la respuesta compatible en el AcroForm existente.
  if (template.code === "F-06") {
    for (let index = 0; index < 12; index += 1) {
      const base = 143 + index * 3;
      const present = fields.find((field) => field.name === `t0${base}`);
      const copy = fields.find((field) => field.name === `t0${base + 1}`);
      const observations = fields.find((field) => field.name === `t0${base + 2}`);
      if (present) {
        const concepto = present.label
          .replace(/\s*[-—]\s*presente.*$/i, "")
          .replace(/\s*[-—]\s*orig.*$/i, "");
        present.label = `${concepto} — presente`;
        present.inputType = "select";
        present.options = ["SI", "NO", "NO APLICA"];
        if (copy) copy.label = `${concepto} — original o copia`;
        if (observations) observations.label = `${concepto} — observaciones`;
      }
      if (copy) {
        copy.inputType = "select";
        copy.options = ["ORIGINAL", "COPIA", "DIGITAL", "NO APLICA"];
      }
      if (observations) {
        observations.inputType = "text";
        observations.emptyValue = "SIN OBSERVACIONES";
      }
    }
  }

  if (template.code === "F-07") {
    for (const group of CHOICE_GROUPS["F-07"]) {
      for (const name of group.fields) {
        const field = fields.find((candidate) => candidate.name === name);
        if (!field) continue;
        field.inputType = "boolean";
        field.options = ["SI", "NO"];
      }
      const amountIndex = Number(group.fields[0].slice(1)) + 2;
      const amount = fields.find((field) => field.name === `t${String(amountIndex).padStart(4, "0")}`);
      if (amount) amount.inputType = "number";
    }
  }

  // F-08: la cadena de propietarios trae hasta cinco renglones; sólo el primero
  // es forzoso y el estado del endoso se captura como opción estricta.
  if (template.code === "F-08") {
    const columnas = ["titular", "fecha de factura", "folio fiscal / serie", "endoso correcto"];
    for (let fila = 0; fila < 5; fila += 1) {
      for (let columna = 0; columna < 4; columna += 1) {
        const name = `t${String(238 + fila * 4 + columna).padStart(4, "0")}`;
        const field = fields.find((candidate) => candidate.name === name);
        if (!field) continue;
        field.label = `Propietario ${fila + 1} — ${columnas[columna]}`;
        if (columna === 3) {
          field.inputType = "select";
          field.options = ["SI", "NO", "NO APLICA"];
        }
        if (fila > 0) {
          field.required = false;
          field.emptyValue = "NO APLICA";
        }
      }
    }
  }

  // F-09: la bitácora de trámites se llena conforme avanza el ciclo de vida;
  // un trámite que no aplica se anula en vez de bloquear la validación.
  if (template.code === "F-09") {
    for (const field of fields) {
      if (field.section === "parte_ii_bitacora_de_tramites" && field.source === "capture") {
        field.required = false;
        field.emptyValue = field.emptyValue ?? "NO APLICA";
      }
    }
  }

  // F-10: seis renglones de entradas/salidas; cada celda hereda el número de
  // movimiento y sólo exige captura cuando el movimiento existe.
  if (template.code === "F-10") {
    const columnas = ["fecha", "documento u objeto", "quién retira", "motivo", "devuelto"];
    for (let movimiento = 0; movimiento < 6; movimiento += 1) {
      for (let columna = 0; columna < 5; columna += 1) {
        const name = `t${String(339 + movimiento * 5 + columna).padStart(4, "0")}`;
        const field = fields.find((candidate) => candidate.name === name);
        if (!field) continue;
        field.label = `Movimiento ${movimiento + 1} — ${columnas[columna]}`;
        field.required = false;
        field.emptyValue = "NO APLICA";
      }
    }
  }

  const rules = [...(RULES[template.code] ?? [])];
  if (template.code === "F-07") {
    for (const group of CHOICE_GROUPS["F-07"]) {
      const amountIndex = Number(group.fields[0].slice(1)) + 2;
      const amount = `t${String(amountIndex).padStart(4, "0")}`;
      rules.push(
        { when: { field: group.fields[0], equals: "SI" }, fill: { [amount]: "NO APLICA" } },
        { when: { field: group.fields[1], equals: "SI" }, require: [amount] },
      );
    }
  }
  for (const detail of fields.filter(
    (field) => field.source === "capture" && field.acroType === "Tx" && isOtherDetail(field.name, field.label),
  )) {
    const checkbox = [...fields]
      .reverse()
      .find(
        (field) =>
          field.order < detail.order &&
          field.inputType === "boolean" &&
          /\bOTRO\b/i.test(field.label),
      );
    if (!checkbox) continue;
    rules.push(
      { when: { field: checkbox.name, equals: "SI" }, require: [detail.name] },
      { when: { field: checkbox.name, equals: "NO" }, fill: { [detail.name]: "NO APLICA" } },
    );
  }

  return {
    ...template,
    sections: template.sections.map((section) => ({
      ...section,
      label: normalizarSeccion(section.id, section.label),
    })),
    fields,
    rules,
    choiceGroups: CHOICE_GROUPS[template.code] ?? [],
  };
}

const rawTemplates = catalogoGenerado.templates as unknown as Record<string, PlantillaGenerada>;

export const PLANTILLAS_FORMULARIO: Record<string, PlantillaFormulario> = Object.fromEntries(
  Object.entries(rawTemplates).map(([code, template]) => [code, buildTemplate(template)]),
);

export function obtenerPlantillaFormulario(code: string): PlantillaFormulario {
  const template = PLANTILLAS_FORMULARIO[code];
  if (!template) throw new Error(`Tipo documental sin contrato de formulario: ${code}`);
  return template;
}

export function aplicarReglas(
  template: PlantillaFormulario,
  input: Record<string, string>,
): Record<string, string> {
  const values = { ...input };

  // Si una condición dejó de cumplirse, retira únicamente el valor que esa
  // misma regla había generado. Así SIN garantía -> CON garantía no conserva
  // un NO APLICA que podría hacer pasar una validación incorrecta.
  const activeFills = new Map<string, string>();
  for (const rule of template.rules) {
    if (values[rule.when.field] !== rule.when.equals) continue;
    for (const [field, value] of Object.entries(rule.fill ?? {})) {
      activeFills.set(field, value);
    }
  }
  for (const rule of template.rules) {
    for (const [field, automaticValue] of Object.entries(rule.fill ?? {})) {
      if (!activeFills.has(field) && values[field] === automaticValue) values[field] = "";
    }
  }
  for (const [field, value] of activeFills) {
    values[field] = value;
  }
  return values;
}

export function camposRequeridos(
  template: PlantillaFormulario,
  values: Record<string, string>,
): Set<string> {
  const required = new Set(
    template.fields.filter((field) => field.required).map((field) => field.name),
  );
  for (const rule of template.rules) {
    if (values[rule.when.field] === rule.when.equals) {
      for (const name of rule.require ?? []) required.add(name);
    }
  }
  return required;
}

/** Límite de captura: usa contratos semánticos; el PDF nunca limita por ancho visual. */
export function longitudMaximaCampo(field: CampoFormulario): number {
  if (["boolean", "radio", "select"].includes(field.inputType)) {
    return Math.max(2, ...field.options.map((option) => option.length));
  }
  if (field.inputType === "email") return LONGITUD_MAXIMA_TEXTO_PDF;
  if (field.inputType === "tel") return 10;
  if (field.inputType === "date") return 10;
  if (field.inputType === "time") return 5;
  if (field.systemToken === "kilometraje") return String(MAXIMO_KILOMETRAJE).length;
  if (field.inputType === "number") {
    return DIGITOS_ENTEROS_MAXIMOS_NUMERO + DECIMALES_MAXIMOS_NUMERO + 1;
  }
  if (field.reuseKey?.endsWith(".rfc") || /\bRFC\b/i.test(field.label)) return 13;
  if (field.reuseKey?.endsWith(".curp") || /\bCURP\b/i.test(field.label)) return 18;

  return LONGITUD_MAXIMA_TEXTO_PDF;
}

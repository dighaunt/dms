import "server-only";

import type { PoolClient, QueryResultRow } from "pg";

import { formatearFolio } from "@/lib/api";
import { query, withTransaction } from "@/lib/db";
import { monedaEnLetras, separarMiles } from "@/lib/numeros";

import {
  aplicarReglas,
  camposRequeridos,
  DECIMALES_MAXIMOS_NUMERO,
  DIGITOS_ENTEROS_MAXIMOS_NUMERO,
  longitudMaximaCampo,
  MAXIMO_KILOMETRAJE,
  obtenerPlantillaFormulario,
  type CampoFormulario,
  type PlantillaFormulario,
  type TokenSistema,
} from "./catalogo";
import type { CampoCaptura, CapturaDocumento } from "./tipos";

const RAZON_SOCIAL = "COMERCIALIZADORA AUTOMOTRIZ CLIQUEALO DE MÉXICO, S. DE R.L. DE C.V.";

export type ContextoDocumento = {
  documentoId: number;
  expedienteId: number;
  tipo: string;
  revision: string;
  anio: number;
  consecutivo: number;
  emitidoEn: Date;
  emisorNombre: string;
  numeroExpediente: string;
  abiertoEn: Date;
  vin: string;
  marca: string;
  modelo: string;
  anioModelo: number;
  versionTipo: string | null;
  color: string | null;
  numMotor: string | null;
  kilometrajeIngreso: number | null;
  placas: string | null;
  entidadEmisora: string | null;
  numeroFacturaVigente: string | null;
  numeroConstanciaRepuve: string | null;
  numeroTarjetaCirculacion: string | null;
  refrendosAnio: number | null;
  estadoF06: "INCOMPLETO" | "COMPLETO" | "LISTO_PARA_VENTA";
  escaneado: boolean;
};

type ValorRow = QueryResultRow & {
  campo_pdf?: string;
  clave?: string;
  tipo: "TEXTO" | "NUMERO" | "FECHA" | "BOOLEANO" | "OPCION";
  origen?: "CAPTURA" | "REUTILIZADO" | "SISTEMA" | "DERIVADO" | "REGLA";
  valor_texto: string | null;
  valor_numero: string | null;
  valor_fecha: string | null;
  valor_booleano: boolean | null;
};

type CapturaRow = QueryResultRow & { estado: "BORRADOR" | "COMPLETA" };

export type ResultadoGuardar =
  | { ok: true; captura: CapturaDocumento }
  | { ok: false; missing: ProblemaCampo[] };

type ProblemaCampo = {
  name: string;
  label: string;
  section: string;
  message: string;
};

function fechaCorta(fecha: Date): string {
  const parts = new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).formatToParts(fecha);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("day")} ${value("month").toLocaleUpperCase("es-MX")} ${value("year")}`;
}

function valoresSistema(contexto: ContextoDocumento): Record<TokenSistema, string> {
  const folio = formatearFolio(contexto.tipo, contexto.anio, contexto.consecutivo);
  return {
    folio,
    expVin: `${contexto.numeroExpediente} · ${contexto.vin}`,
    numeroExpediente: contexto.numeroExpediente,
    vin: contexto.vin,
    marcaSubmarca: `${contexto.marca} ${contexto.modelo}`,
    marcaSubmarcaAnio: `${contexto.marca} ${contexto.modelo} / ${contexto.anioModelo}`,
    anio: String(contexto.anioModelo),
    versionTipo: contexto.versionTipo ?? "",
    color: contexto.color ?? "",
    numMotor: contexto.numMotor ?? "",
    kilometraje:
      contexto.kilometrajeIngreso == null ? "" : separarMiles(contexto.kilometrajeIngreso),
    placas: contexto.placas ?? "",
    entidadEmisora: contexto.entidadEmisora ?? "",
    numeroFacturaVigente: contexto.numeroFacturaVigente ?? "",
    numeroConstanciaRepuve: contexto.numeroConstanciaRepuve ?? "",
    numeroTarjetaCirculacion: contexto.numeroTarjetaCirculacion ?? "",
    refrendosAnio: contexto.refrendosAnio == null ? "" : String(contexto.refrendosAnio),
    fecha: fechaCorta(contexto.emitidoEn),
    fechaApertura: fechaCorta(contexto.abiertoEn),
    emisor: contexto.emisorNombre,
    empresaCliquealo: RAZON_SOCIAL,
    compradorLote: RAZON_SOCIAL,
    f06Incompleto: contexto.estadoF06 === "INCOMPLETO" ? "SI" : "NO",
    f06Completo: contexto.estadoF06 === "COMPLETO" ? "SI" : "NO",
    f06Listo: contexto.estadoF06 === "LISTO_PARA_VENTA" ? "SI" : "NO",
  };
}

function valorDeRow(row: ValorRow): string {
  if (row.tipo === "BOOLEANO") return row.valor_booleano ? "SI" : "NO";
  if (row.tipo === "NUMERO") return row.valor_numero ?? "";
  if (row.tipo === "FECHA") return row.valor_fecha ?? "";
  return row.valor_texto ?? "";
}

function origenDeRow(row: ValorRow, field: CampoFormulario): CampoCaptura["source"] {
  if (row.origen === "REUTILIZADO") return "reused";
  if (row.origen === "REGLA") return "rule";
  if (row.origen === "SISTEMA") return "system";
  if (row.origen === "DERIVADO") return "derived";
  return field.source;
}

function vacio(value: string | null | undefined): boolean {
  return value == null || value.trim() === "";
}

function ayudaDeScript(field: CampoFormulario): string | undefined {
  const script = Object.values(field.scripts).join(" ");
  if (script.includes("montoALetra")) {
    return "El sistema normaliza el importe y genera automáticamente su representación con letra.";
  }
  if (script.includes("util.printf")) {
    return "El sistema aplica el formato numérico y la separación de miles al documento final.";
  }
  if (script.includes("conRelleno")) {
    return "El sistema convierte el texto a mayúsculas y cierra el espacio restante al finalizar.";
  }
  if (script.includes("SIN OBSERVACIONES")) {
    return "Este campo se resuelve y se cierra automáticamente cuando no se captura información.";
  }
  return field.help;
}

function derivar(template: PlantillaFormulario, input: Record<string, string>): Record<string, string> {
  const values = { ...input };
  for (const field of template.fields) {
    if (!field.derivedFrom) continue;
    const source = values[field.derivedFrom];
    if (!vacio(source)) values[field.name] = monedaEnLetras(source);
  }
  return values;
}

function normalizeValue(field: CampoFormulario, raw: string): string {
  const value = raw.trim();
  if (value === "") return "";

  // Valores de cierre que el sistema inserta por una regla del formulario.
  // No son una captura numérica ni deben evaluarse contra el ancho del widget.
  if (["NO APLICA", "SIN OBSERVACIONES"].includes(value)) return value;

  if (field.inputType === "number") {
    const normalized = value.replace(/,/g, "");
    const match = /^(\d+)(?:\.(\d+))?$/.exec(normalized);
    if (!match || (match[2]?.length ?? 0) > DECIMALES_MAXIMOS_NUMERO) {
      throw new Error(`Número inválido para ${field.label}`);
    }
    const integer = match[1].replace(/^0+(?=\d)/, "");
    if (integer.length > DIGITOS_ENTEROS_MAXIMOS_NUMERO) {
      throw new Error(
        `El campo ${field.label} admite hasta ${DIGITOS_ENTEROS_MAXIMOS_NUMERO} dígitos enteros`,
      );
    }
    if (field.systemToken === "kilometraje") {
      if (match[2] || BigInt(integer) > BigInt(MAXIMO_KILOMETRAJE)) {
        throw new Error(`El kilometraje debe ser un entero entre 0 y ${MAXIMO_KILOMETRAJE}`);
      }
    }
    return match[2] ? `${integer}.${match[2]}` : integer;
  }

  const maxLength = longitudMaximaCampo(field);
  if (value.length > maxLength) {
    throw new Error(`El campo ${field.label} admite máximo ${maxLength} caracteres`);
  }

  if (["radio", "select", "boolean"].includes(field.inputType)) {
    if (!field.options.includes(value)) {
      throw new Error(`Opción inválida para ${field.label}`);
    }
  }
  if (field.inputType === "date" && value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Fecha inválida para ${field.label}`);
  }
  return value;
}

function valoresAutomaticos(
  template: PlantillaFormulario,
  field: CampoFormulario,
): Set<string> {
  const values = new Set<string>();
  if (field.emptyValue) values.add(field.emptyValue);
  for (const rule of template.rules) {
    const value = rule.fill?.[field.name];
    if (value) values.add(value);
  }
  return values;
}

function fechaIsoReal(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function problemaSemantico(
  field: CampoFormulario,
  value: string,
  required: boolean,
): string | null {
  if (field.source !== "capture") return null;
  if (field.inputType === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return "Capture un correo electrónico válido.";
  }
  if (field.inputType === "tel") {
    const digits = value.replace(/\D/g, "");
    if (digits.length !== 10) return "Capture un teléfono de exactamente 10 dígitos.";
  }
  if (field.inputType === "date" && !fechaIsoReal(value)) {
    return "Capture una fecha válida.";
  }
  if (field.inputType === "time" && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    return "Capture una hora válida en formato de 24 horas.";
  }
  if (field.inputType === "number") {
    const number = Number(value.replace(/,/g, ""));
    if (!Number.isFinite(number) || number < 0 || (required && number <= 0)) {
      return required
        ? "Capture un importe o cantidad mayor que cero."
        : "Capture un número igual o mayor que cero.";
    }
  }
  if ((field.reuseKey?.endsWith(".rfc") || /\bRFC\b/i.test(field.label)) &&
      !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i.test(value)) {
    return "Capture un RFC válido de 12 o 13 caracteres.";
  }
  if ((field.reuseKey?.endsWith(".curp") || /\bCURP\b/i.test(field.label)) &&
      !/^[A-Z][AEIOU][A-Z]{2}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/i.test(value)) {
    return "Capture una CURP válida de 18 caracteres.";
  }
  if (["boolean", "radio", "select"].includes(field.inputType) &&
      !field.options.includes(value)) {
    return "Seleccione una opción válida.";
  }
  return null;
}

function prepararValoresFinales(
  template: PlantillaFormulario,
  input: Record<string, string>,
  origins?: Record<string, CampoCaptura["source"]>,
): Record<string, string> {
  let values = aplicarReglas(template, input);
  values = derivar(template, values);
  const required = camposRequeridos(template, values);

  for (const field of template.fields) {
    if (!vacio(values[field.name]) || required.has(field.name)) continue;
    const automaticValue = field.emptyValue ?? (field.inputType === "boolean" ? "NO" : undefined);
    if (!automaticValue) continue;
    values[field.name] = automaticValue;
    if (origins) origins[field.name] = "rule";
  }

  values = aplicarReglas(template, values);
  return derivar(template, values);
}

function validarFormulario(
  template: PlantillaFormulario,
  values: Record<string, string>,
): ProblemaCampo[] {
  const required = camposRequeridos(template, values);
  const problems: ProblemaCampo[] = [];
  const seen = new Set<string>();
  const add = (field: CampoFormulario, message: string) => {
    const key = `${field.name}:${message}`;
    if (seen.has(key)) return;
    seen.add(key);
    problems.push({ name: field.name, label: field.label, section: field.section, message });
  };

  for (const field of template.fields) {
    const value = values[field.name]?.trim() ?? "";
    if (!value) {
      add(field, required.has(field.name)
        ? "Este dato es obligatorio para la condición seleccionada."
        : "El sistema no pudo resolver este campo automáticamente.");
      continue;
    }
    const isRequired = required.has(field.name);
    if (isRequired && (/^(?:NO APLICA|SIN OBSERVACIONES)$/i.test(value) || !value.replace(/[\s-]/g, ""))) {
      add(field, "La condición seleccionada exige un dato real; una anulación no es válida.");
      continue;
    }
    if (valoresAutomaticos(template, field).has(value)) {
      if (isRequired) {
        add(field, "La condición seleccionada exige un dato real; el valor automático no es válido.");
      }
      continue;
    }
    const semantic = problemaSemantico(field, value, isRequired);
    if (semantic) add(field, semantic);
  }

  for (const group of template.choiceGroups) {
    const selected = group.fields.filter((name) => values[name] === "SI").length;
    if (selected >= group.min && selected <= group.max) continue;
    for (const name of group.fields) {
      const field = template.fields.find((candidate) => candidate.name === name);
      if (field) add(field, `${group.label}: seleccione exactamente una opción.`);
    }
  }
  return problems;
}

type TipoDb = ValorRow["tipo"];

function tipoDb(field: CampoFormulario, value: string): TipoDb {
  if (value === "NO APLICA") return "OPCION";
  if (field.source === "system" || field.source === "derived") return "TEXTO";
  if (field.inputType === "number") return "NUMERO";
  if (field.inputType === "date") return "FECHA";
  if (field.inputType === "boolean") return "BOOLEANO";
  if (["radio", "select"].includes(field.inputType)) return "OPCION";
  return "TEXTO";
}

function columnasValor(tipo: TipoDb, value: string): [string | null, string | null, string | null, boolean | null] {
  if (tipo === "NUMERO") return [null, value.replace(/,/g, ""), null, null];
  if (tipo === "FECHA") return [null, null, value, null];
  if (tipo === "BOOLEANO") return [null, null, null, value === "SI"];
  return [value, null, null, null];
}

export async function obtenerContextoDocumento(id: number): Promise<ContextoDocumento | null> {
  const { rows } = await query<{
    documento_id: string;
    expediente_id: string;
    tipo_codigo: string;
    revision: string;
    anio: number;
    consecutivo: number;
    emitido_en: Date;
    emisor_nombre: string;
    numero_expediente: string;
    abierto_en: Date;
    vin: string;
    marca: string;
    modelo: string;
    anio_modelo: number;
    version_tipo: string | null;
    color: string | null;
    num_motor: string | null;
    kilometraje_ingreso: number | null;
    placas: string | null;
    entidad_emisora: string | null;
    numero_factura_vigente: string | null;
    numero_constancia_repuve: string | null;
    numero_tarjeta_circulacion: string | null;
    refrendos_anio: number | null;
    estado_f06: "INCOMPLETO" | "COMPLETO" | "LISTO_PARA_VENTA";
    escaneado: boolean;
  }>(
    `SELECT d.id AS documento_id, d.expediente_id, d.tipo_codigo, d.revision,
            d.anio, d.consecutivo, d.emitido_en, us.nombre AS emisor_nombre,
            e.anio::text || '-' || lpad(e.consecutivo::text, 3, '0') AS numero_expediente,
            e.abierto_en, e.vin, ma.nombre AS marca, mo.nombre AS modelo,
            un.anio_modelo, un.version_tipo, un.color, un.num_motor, un.kilometraje_ingreso,
            un.placas, un.entidad_emisora, un.numero_factura_vigente,
            un.numero_constancia_repuve, un.numero_tarjeta_circulacion, un.refrendos_anio,
            COALESCE((SELECT h.estado FROM traza.expediente_estado_hist h
                       WHERE h.expediente_id = e.id
                       ORDER BY h.ocurrido_en DESC LIMIT 1), 'INCOMPLETO') AS estado_f06,
            EXISTS (SELECT 1 FROM traza.archivo_escaneado a WHERE a.documento_id = d.id) AS escaneado
       FROM traza.documento d
       JOIN traza.expediente e ON e.id = d.expediente_id
       JOIN traza.unidad un ON un.vin = e.vin
       JOIN traza.modelo mo ON mo.id = un.modelo_id
       JOIN traza.marca ma ON ma.id = mo.marca_id
       JOIN traza.usuario us ON us.id = d.emitido_por
      WHERE d.id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    documentoId: Number(row.documento_id),
    expedienteId: Number(row.expediente_id),
    tipo: row.tipo_codigo,
    revision: row.revision,
    anio: row.anio,
    consecutivo: row.consecutivo,
    emitidoEn: new Date(row.emitido_en),
    emisorNombre: row.emisor_nombre,
    numeroExpediente: row.numero_expediente,
    abiertoEn: new Date(row.abierto_en),
    vin: row.vin,
    marca: row.marca,
    modelo: row.modelo,
    anioModelo: row.anio_modelo,
    versionTipo: row.version_tipo,
    color: row.color,
    numMotor: row.num_motor,
    kilometrajeIngreso: row.kilometraje_ingreso,
    placas: row.placas,
    entidadEmisora: row.entidad_emisora,
    numeroFacturaVigente: row.numero_factura_vigente,
    numeroConstanciaRepuve: row.numero_constancia_repuve,
    numeroTarjetaCirculacion: row.numero_tarjeta_circulacion,
    refrendosAnio: row.refrendos_anio,
    estadoF06: row.estado_f06,
    escaneado: row.escaneado,
  };
}

async function cargarValores(contexto: ContextoDocumento) {
  const [captura, documento, expediente] = await Promise.all([
    query<CapturaRow>(
      `SELECT estado FROM traza.documento_captura WHERE documento_id = $1`,
      [contexto.documentoId],
    ),
    query<ValorRow>(
      `SELECT campo_pdf, tipo, origen, valor_texto, valor_numero::text,
              valor_fecha::text, valor_booleano
         FROM traza.documento_campo_valor WHERE documento_id = $1`,
      [contexto.documentoId],
    ),
    query<ValorRow>(
      `SELECT clave, tipo, valor_texto, valor_numero::text,
              valor_fecha::text, valor_booleano
         FROM traza.expediente_dato WHERE expediente_id = $1`,
      [contexto.expedienteId],
    ),
  ]);
  return {
    estado: captura.rows[0]?.estado ?? "BORRADOR",
    documento: new Map(documento.rows.map((row) => [row.campo_pdf!, row])),
    expediente: new Map(expediente.rows.map((row) => [row.clave!, row])),
  };
}

function resolverValores(
  contexto: ContextoDocumento,
  template: PlantillaFormulario,
  stored: Awaited<ReturnType<typeof cargarValores>>,
): { values: Record<string, string>; origins: Record<string, CampoCaptura["source"]> } {
  const system = valoresSistema(contexto);
  const values: Record<string, string> = {};
  const origins: Record<string, CampoCaptura["source"]> = {};

  for (const field of template.fields) {
    const snapshot = stored.documento.get(field.name);
    if (snapshot && stored.estado === "COMPLETA" && (!field.systemToken || contexto.escaneado)) {
      values[field.name] = valorDeRow(snapshot);
      origins[field.name] = origenDeRow(snapshot, field);
      continue;
    }
    if (field.systemToken) {
      values[field.name] = system[field.systemToken];
      origins[field.name] = "system";
      continue;
    }
    if (snapshot) {
      values[field.name] = valorDeRow(snapshot);
      origins[field.name] = origenDeRow(snapshot, field);
      continue;
    }
    if (field.reuseKey) {
      const reused = stored.expediente.get(field.reuseKey);
      if (reused) {
        values[field.name] = valorDeRow(reused);
        origins[field.name] = "reused";
      }
    }
  }

  const ruled = aplicarReglas(template, values);
  for (const [name, value] of Object.entries(ruled)) {
    if (values[name] !== value) origins[name] = "rule";
  }
  const derived = derivar(template, ruled);
  for (const field of template.fields) {
    if (field.source === "derived" && derived[field.name]) origins[field.name] = "derived";
  }
  return { values: derived, origins };
}

export async function obtenerCapturaDocumento(
  id: number,
  usuarioId: number,
): Promise<CapturaDocumento | null> {
  const contexto = await obtenerContextoDocumento(id);
  if (!contexto) return null;
  const template = obtenerPlantillaFormulario(contexto.tipo);
  const stored = await cargarValores(contexto);
  const guia = await query<{ confirmada: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM traza.documento_guia_confirmacion
        WHERE documento_id = $1
          AND confirmado_por = $2
          AND guia_revision = 'M-01 Rev. 3.0'
     ) AS confirmada`,
    [id, usuarioId],
  );
  const { values, origins } = resolverValores(contexto, template, stored);
  const required = camposRequeridos(template, values);
  const seenSystem = new Set<TokenSistema>();
  const fields = template.fields.map((field): CampoCaptura => {
    const duplicateSystem = field.systemToken ? seenSystem.has(field.systemToken) : false;
    if (field.systemToken) seenSystem.add(field.systemToken);
    const value = values[field.name] ?? "";
    return {
      name: field.name,
      label: field.label,
      section: field.section,
      page: field.page,
      order: field.order,
      inputType: field.inputType,
      maxLength: longitudMaximaCampo(field),
      options: field.options,
      value,
      source: origins[field.name] ?? field.source,
      readOnly:
        field.source === "derived" ||
        (field.source === "system" && !vacio(value)) ||
        contexto.escaneado,
      visible: !duplicateSystem && field.source !== "derived",
      baseRequired: field.required,
      required: required.has(field.name),
      automaticValue: field.emptyValue,
      help: ayudaDeScript(field),
    };
  });
  const visible = fields.filter((field) => field.visible);
  const complete = visible.filter((field) => !vacio(field.value)).length;
  const warnings = visible.filter((field) => vacio(field.value) && !field.required).length;
  return {
    documentoId: contexto.documentoId,
    tipo: contexto.tipo,
    folio: formatearFolio(contexto.tipo, contexto.anio, contexto.consecutivo),
    revision: contexto.revision,
    estado: stored.estado,
    bloqueada: contexto.escaneado,
    guiaConfirmada: guia.rows[0]?.confirmada ?? false,
    sections: template.sections,
    fields,
    rules: template.rules,
    choiceGroups: template.choiceGroups,
    progress: {
      total: visible.length,
      complete,
      missing: visible.length - complete - warnings,
      warnings,
    },
  };
}

export async function confirmarGuiaDocumento(id: number, usuarioId: number): Promise<boolean> {
  const documento = await query<{ id: string }>(
    `SELECT id FROM traza.documento WHERE id = $1`,
    [id],
  );
  if (documento.rowCount === 0) return false;

  await query(
    `INSERT INTO traza.documento_guia_confirmacion (documento_id, guia_revision, confirmado_por)
     VALUES ($1, 'M-01 Rev. 3.0', $2)
     ON CONFLICT (documento_id, guia_revision, confirmado_por) DO NOTHING`,
    [id, usuarioId],
  );
  return true;
}

async function upsertDocumentoValores(
  client: PoolClient,
  documentoId: number,
  usuarioId: number,
  template: PlantillaFormulario,
  values: Record<string, string>,
  origins: Record<string, CampoCaptura["source"]>,
) {
  const rows = template.fields
    .filter((field) => !vacio(values[field.name]))
    .map((field) => {
      const value = values[field.name];
      const tipo = tipoDb(field, value);
      const columns = columnasValor(tipo, value);
      const source = origins[field.name] ?? field.source;
      const origen = source === "reused"
        ? "REUTILIZADO"
        : source === "system"
          ? "SISTEMA"
          : source === "derived"
            ? "DERIVADO"
            : source === "rule"
              ? "REGLA"
              : "CAPTURA";
      return [documentoId, field.name, tipo, origen, ...columns, usuarioId];
    });
  if (rows.length === 0) return;

  const params: unknown[] = [];
  const tuples = rows.map((row) => {
    const base = params.length;
    params.push(...row);
    return `(${row.map((_, index) => `$${base + index + 1}`).join(",")}, now())`;
  });
  await client.query(
    `INSERT INTO traza.documento_campo_valor (
       documento_id, campo_pdf, tipo, origen, valor_texto, valor_numero,
       valor_fecha, valor_booleano, actualizado_por, actualizado_en
     ) VALUES ${tuples.join(",")}
     ON CONFLICT (documento_id, campo_pdf) DO UPDATE SET
       tipo = EXCLUDED.tipo, origen = EXCLUDED.origen,
       valor_texto = EXCLUDED.valor_texto, valor_numero = EXCLUDED.valor_numero,
       valor_fecha = EXCLUDED.valor_fecha, valor_booleano = EXCLUDED.valor_booleano,
       actualizado_por = EXCLUDED.actualizado_por, actualizado_en = EXCLUDED.actualizado_en`,
    params,
  );
}

async function upsertReusableValues(
  client: PoolClient,
  expedienteId: number,
  usuarioId: number,
  template: PlantillaFormulario,
  values: Record<string, string>,
) {
  const byKey = new Map<string, { field: CampoFormulario; value: string }>();
  for (const field of template.fields) {
    const value = values[field.name];
    if (field.reuseKey && !vacio(value)) byKey.set(field.reuseKey, { field, value });
  }
  if (byKey.size === 0) return;

  const params: unknown[] = [];
  const tuples = [...byKey.entries()].map(([key, { field, value }]) => {
    const tipo = tipoDb(field, value);
    const row = [expedienteId, key, tipo, ...columnasValor(tipo, value), usuarioId];
    const base = params.length;
    params.push(...row);
    return `(${row.map((_, index) => `$${base + index + 1}`).join(",")}, now())`;
  });
  await client.query(
    `INSERT INTO traza.expediente_dato (
       expediente_id, clave, tipo, valor_texto, valor_numero, valor_fecha,
       valor_booleano, actualizado_por, actualizado_en
     ) VALUES ${tuples.join(",")}
     ON CONFLICT (expediente_id, clave) DO UPDATE SET
       tipo = EXCLUDED.tipo, valor_texto = EXCLUDED.valor_texto,
       valor_numero = EXCLUDED.valor_numero, valor_fecha = EXCLUDED.valor_fecha,
       valor_booleano = EXCLUDED.valor_booleano,
       actualizado_por = EXCLUDED.actualizado_por, actualizado_en = EXCLUDED.actualizado_en`,
    params,
  );
}

export async function guardarCapturaDocumento(
  id: number,
  usuarioId: number,
  input: Record<string, string>,
  complete: boolean,
): Promise<ResultadoGuardar | null> {
  const contexto = await obtenerContextoDocumento(id);
  if (!contexto) return null;
  if (contexto.escaneado) throw new Error("El documento ya fue escaneado y su captura es inmutable");
  const guia = await query<{ confirmada: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM traza.documento_guia_confirmacion
        WHERE documento_id = $1 AND confirmado_por = $2 AND guia_revision = 'M-01 Rev. 3.0'
     ) AS confirmada`,
    [id, usuarioId],
  );
  if (!guia.rows[0]?.confirmada) {
    throw new Error("Confirma la guía operativa M-01 antes de iniciar la captura");
  }
  const template = obtenerPlantillaFormulario(contexto.tipo);
  const byName = new Map(template.fields.map((field) => [field.name, field]));
  const provided: Record<string, string> = {};
  for (const [name, raw] of Object.entries(input)) {
    const field = byName.get(name);
    if (!field || field.source === "derived") continue;
    provided[name] = normalizeValue(field, raw);
  }
  const clearedFields = Object.entries(provided)
    .filter(([, value]) => vacio(value))
    .map(([name]) => name);

  const stored = await cargarValores(contexto);
  const resolved = resolverValores(contexto, template, stored);
  let values = { ...resolved.values, ...provided };
  const origins = { ...resolved.origins };
  for (const name of Object.keys(provided)) origins[name] = "capture";

  // Datos maestros faltantes se capturan una vez aquí y alimentan todos los PDFs.
  const system = valoresSistema(contexto);
  const masterUpdates: Partial<Record<TokenSistema, string>> = {};
  for (const field of template.fields) {
    if (!field.systemToken || vacio(provided[field.name]) || !vacio(system[field.systemToken])) continue;
    masterUpdates[field.systemToken] = provided[field.name];
  }
  for (const field of template.fields) {
    if (field.systemToken && masterUpdates[field.systemToken] != null) {
      values[field.name] = masterUpdates[field.systemToken]!;
      origins[field.name] = "system";
    }
  }

  values = aplicarReglas(template, values);
  for (const rule of template.rules) {
    if (values[rule.when.field] !== rule.when.equals) continue;
    for (const name of Object.keys(rule.fill ?? {})) origins[name] = "rule";
  }
  values = derivar(template, values);
  for (const field of template.fields) {
    if (field.source === "derived" && !vacio(values[field.name])) origins[field.name] = "derived";
  }

  const conservarCompleta = complete || stored.estado === "COMPLETA";
  if (conservarCompleta) {
    values = prepararValoresFinales(template, values, origins);
    const problems = validarFormulario(template, values);
    if (problems.length > 0) return { ok: false, missing: problems };
  }

  await withTransaction(async (client) => {
    if (
      masterUpdates.color != null ||
      masterUpdates.numMotor != null ||
      masterUpdates.kilometraje != null ||
      masterUpdates.versionTipo != null ||
      masterUpdates.placas != null ||
      masterUpdates.entidadEmisora != null ||
      masterUpdates.numeroFacturaVigente != null ||
      masterUpdates.numeroConstanciaRepuve != null ||
      masterUpdates.numeroTarjetaCirculacion != null ||
      masterUpdates.refrendosAnio != null
    ) {
      await client.query(
        `UPDATE traza.unidad SET
           color = COALESCE(color, $2),
           num_motor = COALESCE(num_motor, $3),
           kilometraje_ingreso = COALESCE(kilometraje_ingreso, $4),
           version_tipo = COALESCE(version_tipo, $5),
           placas = COALESCE(placas, $6),
           entidad_emisora = COALESCE(entidad_emisora, $7),
           numero_factura_vigente = COALESCE(numero_factura_vigente, $8),
           numero_constancia_repuve = COALESCE(numero_constancia_repuve, $9),
           numero_tarjeta_circulacion = COALESCE(numero_tarjeta_circulacion, $10),
           refrendos_anio = COALESCE(refrendos_anio, $11)
         WHERE vin = $1`,
        [
          contexto.vin,
          masterUpdates.color || null,
          masterUpdates.numMotor || null,
          masterUpdates.kilometraje != null
            ? Number(masterUpdates.kilometraje.replace(/,/g, ""))
            : null,
          masterUpdates.versionTipo || null,
          masterUpdates.placas || null,
          masterUpdates.entidadEmisora || null,
          masterUpdates.numeroFacturaVigente || null,
          masterUpdates.numeroConstanciaRepuve || null,
          masterUpdates.numeroTarjetaCirculacion || null,
          masterUpdates.refrendosAnio != null
            ? Number(masterUpdates.refrendosAnio.replace(/,/g, ""))
            : null,
        ],
      );
    }
    await client.query(
      `INSERT INTO traza.documento_captura (
         documento_id, estado, iniciado_por, actualizado_por, completado_por, completado_en
       ) VALUES ($1, $2, $3, $3, $4, CASE WHEN $4::bigint IS NULL THEN NULL ELSE now() END)
       ON CONFLICT (documento_id) DO UPDATE SET
         estado = EXCLUDED.estado,
         actualizado_por = EXCLUDED.actualizado_por,
         actualizado_en = now(),
         completado_por = EXCLUDED.completado_por,
         completado_en = EXCLUDED.completado_en`,
      [id, conservarCompleta ? "COMPLETA" : "BORRADOR", usuarioId, conservarCompleta ? usuarioId : null],
    );
    if (clearedFields.length > 0) {
      await client.query(
        `DELETE FROM traza.documento_campo_valor
          WHERE documento_id = $1 AND campo_pdf = ANY($2::text[])`,
        [id, clearedFields],
      );
    }
    await upsertReusableValues(client, contexto.expedienteId, usuarioId, template, values);
    await upsertDocumentoValores(client, id, usuarioId, template, values, origins);
  });

  const captura = await obtenerCapturaDocumento(id, usuarioId);
  if (!captura) return null;
  return { ok: true, captura };
}

export async function valoresParaPdf(id: number): Promise<{
  contexto: ContextoDocumento;
  template: PlantillaFormulario;
  values: Record<string, string>;
} | null> {
  const contexto = await obtenerContextoDocumento(id);
  if (!contexto) return null;
  const template = obtenerPlantillaFormulario(contexto.tipo);
  const stored = await cargarValores(contexto);
  if (stored.estado !== "COMPLETA") {
    throw new Error("Completa el wizard antes de generar el PDF final");
  }
  const { values } = resolverValores(contexto, template, stored);
  const finalValues = prepararValoresFinales(template, values);
  const problems = validarFormulario(template, finalValues);
  if (problems.length > 0) {
    throw new Error(
      `El documento no superó la validación final: ${problems[0].label} — ${problems[0].message}`,
    );
  }
  return { contexto, template, values: finalValues };
}

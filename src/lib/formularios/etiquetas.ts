// Normaliza los textos crudos extraídos de los PDF (captions impresos junto a
// cada AcroForm) a etiquetas humanas para el wizard. El nombre técnico del
// campo (name) nunca se toca: es la llave contra el PDF y la base de datos.

const SIGLAS = new Set([
  "VIN", "NIV", "RFC", "CURP", "INE", "REPUVE", "CFDI", "KYC", "MN", "OP1", "OP2",
]);

const CODIGO_DOCUMENTO = /^[FC]-\d{2}$/i;

// Paréntesis que son instrucciones de llenado del formato impreso, no datos:
// el control del wizard ya las resuelve (selects, date pickers, formato numérico).
const PARENTESIS_DESCARTABLES = [
  /^s[íi]\s*\/\s*no/i,
  /^dd\/mm/i,
  /^\$/,
  /marque/i,
  /^n[úu]mero$/i,
];

function nucleoDeToken(token: string): string {
  return token.replace(/^[(¿¡"']+|[),.;:!?"']+$/g, "").replace(/\./g, "");
}

/** Pasa un texto EN MAYÚSCULAS DE FORMATO a tipo oración, preservando siglas. */
export function fraseHumana(texto: string): string {
  const tokens = texto.split(/\s+/).map((token) => {
    const nucleo = nucleoDeToken(token);
    if (!nucleo || /^\d/.test(nucleo)) return token;
    if (SIGLAS.has(nucleo.toUpperCase()) || CODIGO_DOCUMENTO.test(nucleo)) return token;
    if (token.includes("°")) return token;
    const letras = nucleo.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, "");
    if (letras.length >= 1 && letras === letras.toLocaleUpperCase("es-MX")) {
      return token.toLocaleLowerCase("es-MX");
    }
    return token;
  });
  const unido = tokens.join(" ").trim().replace(/\bde el\b/g, "del");
  // Se eleva la primera letra sólo si el texto arranca en minúscula, saltando
  // signos de apertura ("¿quién…" → "¿Quién…"); "17 caracteres" queda intacto.
  const inicio = unido.search(/[A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ]/);
  if (inicio >= 0 && /[a-záéíóúüñ]/.test(unido[inicio])) {
    return (
      unido.slice(0, inicio) +
      unido[inicio].toLocaleUpperCase("es-MX") +
      unido.slice(inicio + 1)
    );
  }
  return unido;
}

/**
 * Limpia un caption impreso: quita numeración del formato ("14. NOMBRE…"),
 * encabezados de parte, instrucciones tras raya o punto y coma, y convierte
 * los paréntesis largos en texto de ayuda en lugar de saturar la etiqueta.
 */
export function normalizarEtiquetaCampo(raw: string): { label: string; hint?: string } {
  let texto = raw.replace(/\s+/g, " ").trim();
  texto = texto.replace(/^PARTE\s+[IVXLC]+\s+/i, "");
  // Una cola larga tras raya es instrucción impresa ("— únicas válidas; …");
  // una corta es parte del nombre ("Baja de placas — Jalisco").
  texto = texto.replace(/\s+—\s+.{25,}$/, "");
  texto = texto.replace(/;.*$/, "");
  texto = texto.replace(/^\d{1,2}\.\s*/, "");

  const ayudas: string[] = [];
  texto = texto.replace(/(\s*)\(([^)]*)\)/g, (_completo, espacio: string, interior: string) => {
    const valor = interior.trim();
    if (!valor || PARENTESIS_DESCARTABLES.some((patron) => patron.test(valor))) return "";
    if (CODIGO_DOCUMENTO.test(valor) || valor.length <= 7) {
      // "(s)" de plural queda pegado a su palabra; el resto se separa para
      // que el casing por token funcione ("EMISOR(entidad)" → "emisor (entidad)").
      return valor.length <= 2 && espacio === "" ? `(${valor})` : ` (${valor})`;
    }
    ayudas.push(valor);
    return "";
  });

  texto = texto.replace(/\s+/g, " ").replace(/\s*[-–—:,]\s*$/, "").trim();
  return {
    label: fraseHumana(texto),
    hint: ayudas.length > 0
      ? `${fraseHumana(ayudas.join("; ")).replace(/\.$/, "")}.`
      : undefined,
  };
}

/** Título humano de una sección del PDF ("Parte Ii Unidad Objeto…" → oración). */
export function normalizarSeccion(id: string, label: string): string {
  const pagina = /^pagina_(\d+)$/.exec(id);
  if (pagina) {
    return pagina[1] === "1" ? "Folio y expediente" : `Folio y expediente (pág. ${pagina[1]})`;
  }
  let texto = label.replace(/\s+/g, " ").trim();
  texto = texto.replace(/^Parte\s+[IVXLC]+\s*/i, "");
  texto = texto.replace(/\s*—.*$/, "").replace(/;.*$/, "").trim();
  const oracion = texto.toLocaleLowerCase("es-MX");
  return (oracion.charAt(0).toLocaleUpperCase("es-MX") + oracion.slice(1))
    .replace(/\b(kyc|[fc]-\d{2})\b/gi, (codigo) => codigo.toUpperCase());
}

/**
 * Texto corto de una alternativa dentro de un grupo de opción única:
 * "Origen - particular" → "Particular", "Tenencias - sin adeudo" → "Sin adeudo".
 */
export function etiquetaAlternativa(label: string): string {
  const sinPrefijo = label.replace(/^[^—-]{2,60}?\s[-—]\s/, "").trim();
  const base = sinPrefijo.length >= 2 ? sinPrefijo : label;
  return base.charAt(0).toLocaleUpperCase("es-MX") + base.slice(1);
}

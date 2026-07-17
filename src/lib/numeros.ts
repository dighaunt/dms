const FORMATEADOR_ENTEROS = new Intl.NumberFormat("es-MX", {
  maximumFractionDigits: 0,
  useGrouping: true,
});

/** Conserva únicamente los dígitos de un entero no negativo. */
export function soloDigitos(valor: string): string {
  return valor.replace(/\D/g, "");
}

/** Separa millares sin alterar el valor numérico que se guarda. */
export function separarMiles(
  valor: string | number | null | undefined,
): string {
  if (valor == null || valor === "") return "";

  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) return "";
    return FORMATEADOR_ENTEROS.format(Math.trunc(valor));
  }

  const digitos = soloDigitos(valor);
  return digitos === "" ? "" : FORMATEADOR_ENTEROS.format(BigInt(digitos));
}

export type LecturaNumeroAgrupado = {
  agrupado: string;
  escala: string;
};

/**
 * Da una lectura visual de un decimal sin convertirlo a Number, para no perder
 * precisión en los numeric(18,2) que se capturan en los contratos.
 */
export function lecturaNumeroAgrupado(
  valor: string | number | null | undefined,
): LecturaNumeroAgrupado | null {
  if (valor == null || valor === "") return null;
  const normalizado = String(valor).trim().replace(/,/g, "");
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(normalizado);
  if (!match) return null;

  const entero = match[1].replace(/^0+(?=\d)/, "");
  const decimales = match[2];
  const agrupado = `${FORMATEADOR_ENTEROS.format(BigInt(entero))}${
    decimales === undefined ? "" : `.${decimales}`
  }`;

  const grupos = entero.match(/\d{1,3}(?=(?:\d{3})*$)/g) ?? ["0"];
  const escala = grupos
    .map((grupo, indice) => {
      const cantidad = BigInt(grupo);
      if (cantidad === 0n) return null;
      const posicion = grupos.length - indice - 1;
      const texto = cantidad.toString();
      if (posicion === 0) return `${texto} ${cantidad === 1n ? "unidad" : "unidades"}`;
      if (posicion === 1) return `${texto} mil`;
      if (posicion === 2) return `${texto} ${cantidad === 1n ? "millón" : "millones"}`;
      if (posicion === 3) return `${texto} mil millones`;
      if (posicion === 4) return `${texto} ${cantidad === 1n ? "billón" : "billones"}`;
      return `${texto} mil billones`;
    })
    .filter((grupo): grupo is string => grupo !== null)
    .join(" · ");

  return { agrupado, escala: escala || "0 unidades" };
}

const UNIDADES = [
  "CERO", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE",
  "DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISÉIS", "DIECISIETE",
  "DIECIOCHO", "DIECINUEVE", "VEINTE", "VEINTIUNO", "VEINTIDÓS", "VEINTITRÉS",
  "VEINTICUATRO", "VEINTICINCO", "VEINTISÉIS", "VEINTISIETE", "VEINTIOCHO", "VEINTINUEVE",
] as const;

function apocopar(valor: string): string {
  return valor.replace(/VEINTIUNO$/, "VEINTIÚN").replace(/ Y UNO$/, " Y UN").replace(/UNO$/, "UN");
}

function centenas(numero: number, apocope = false): string {
  if (numero < 30) {
    const valor = UNIDADES[numero];
    return apocope ? apocopar(valor) : valor;
  }

  if (numero < 100) {
    const decenas = ["", "", "", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
    const resto = numero % 10;
    const valor = resto === 0 ? decenas[Math.floor(numero / 10)] : `${decenas[Math.floor(numero / 10)]} Y ${UNIDADES[resto]}`;
    return apocope ? apocopar(valor) : valor;
  }

  if (numero === 100) return "CIEN";
  const centenasTexto = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];
  const resto = numero % 100;
  const valor = resto === 0
    ? centenasTexto[Math.floor(numero / 100)]
    : `${centenasTexto[Math.floor(numero / 100)]} ${centenas(resto, apocope)}`;
  return apocope ? apocopar(valor) : valor;
}

function enteroEnLetras(numero: number): string {
  if (numero === 0) return "CERO";
  if (numero < 1_000) return centenas(numero);

  const partes: string[] = [];
  const millones = Math.floor(numero / 1_000_000);
  const miles = Math.floor((numero % 1_000_000) / 1_000);
  const resto = numero % 1_000;

  if (millones > 0) {
    partes.push(millones === 1 ? "UN MILLÓN" : `${centenas(millones, true)} MILLONES`);
  }
  if (miles > 0) {
    // Mandato documental: escribir UN MIL, no dejar el inicio en "MIL".
    partes.push(miles === 1 ? "UN MIL" : `${centenas(miles, true)} MIL`);
  }
  if (resto > 0) partes.push(centenas(resto));
  return partes.join(" ");
}

/** Convierte moneda a letra y conserva centavos para cerrar la alteración. */
export function monedaEnLetras(valor: string | number): string {
  const normalizado = typeof valor === "number"
    ? valor
    : Number(valor.replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(normalizado) || normalizado < 0 || normalizado > 999_999_999.99) {
    throw new Error("El monto debe estar entre 0 y 999,999,999.99");
  }
  const redondeado = Math.round(normalizado * 100);
  const entero = Math.floor(redondeado / 100);
  const centavos = redondeado % 100;
  return `${apocopar(enteroEnLetras(entero))} ${entero === 1 ? "PESO" : "PESOS"} ${String(centavos).padStart(2, "0")}/100 M.N.`;
}

/** Cierra el sobrante de una línea libre con guiones ASCII. */
export function cerrarConGuiones(valor: string, longitud = 60): string {
  const limpio = valor.trim().replace(/\s+/g, " ").toUpperCase();
  if (!limpio) return "";
  const faltantes = Math.max(3, longitud - limpio.length - 1);
  return `${limpio} ${"-".repeat(faltantes)}`;
}

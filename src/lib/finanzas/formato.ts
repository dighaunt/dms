import { monedaEnLetras } from "@/lib/numeros";

/**
 * Presentación de los formatos CACM-RCI.
 *
 * En el papel, el VIN y el importe se escriben con un carácter por casilla.
 * Esa cuadrícula no es decorativa: obliga a quien captura a ir carácter por
 * carácter y hace evidente un dígito de más o de menos. En digital las
 * casillas no hacen falta para escribir, pero sí para LEER y cotejar contra
 * la forma impresa, así que se conserva la misma agrupación.
 */

export const LONGITUD_VIN = 17;

/** Un VIN válido no usa I, O ni Q, para no confundirlas con 1 y 0. */
const VIN_VALIDO = /^[A-HJ-NPR-Z0-9]{17}$/;

export function vinEsValido(vin: string): boolean {
  return VIN_VALIDO.test(vin.toUpperCase());
}

/**
 * Devuelve el VIN como casillas individuales. Cuando el dato aún está
 * incompleto se rellena con null hasta 17, de modo que la cuadrícula conserve
 * su tamaño y se vea cuántos caracteres faltan.
 */
export function casillasVin(vin: string | null | undefined): (string | null)[] {
  const limpio = (vin ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, LONGITUD_VIN);
  return Array.from({ length: LONGITUD_VIN }, (_, i) => limpio[i] ?? null);
}

/** El VIN separado para lectura en voz alta o cotejo contra el papel. */
export function vinEnCasillas(vin: string | null | undefined): string {
  return casillasVin(vin)
    .map((c) => c ?? "_")
    .join(" ");
}

export type ImporteEnCasillas = {
  /** Parte entera con separación de millares, como se escribe en el papel. */
  pesos: string;
  /** Siempre dos dígitos: el papel imprime el punto decimal por adelantado. */
  centavos: string;
  /** Representación completa lista para mostrar. */
  texto: string;
  /** Importe con letra, obligatorio en RCI-01, 04, 05 y 06. */
  letra: string;
};

/**
 * Divide el importe como lo divide la forma impresa: "$ ____ . __".
 * Se opera sobre la cadena y no sobre un Number para no perder centavos en
 * cifras grandes; numeric(18,2) admite montos que el punto flotante ya
 * redondea mal.
 */
export function importeEnCasillas(monto: string | number): ImporteEnCasillas {
  const canonico = typeof monto === "number" ? monto.toFixed(2) : monto.trim().replace(/,/g, "");
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(canonico);

  if (!match) {
    return { pesos: "0", centavos: "00", texto: "$0.00", letra: monedaEnLetras("0") };
  }

  const [, signo, entero, decimales] = match;
  const centavos = (decimales ?? "").padEnd(2, "0");
  const pesos = entero.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return {
    pesos: `${signo}${pesos}`,
    centavos,
    texto: `$${signo}${pesos}.${centavos}`,
    letra: monedaEnLetras(`${signo}${entero}.${centavos}`),
  };
}

/**
 * Horas que un cobro puede permanecer sin que el custodio confirme su
 * recepción antes de que el sistema lo señale. No es un candado: es dinero
 * que ya salió de las manos del vendedor y que nadie ha aceptado todavía, y
 * el manual quiere que eso sea visible, no que detenga la operación.
 */
export const HORAS_ALERTA_CUSTODIA = 4;

export function custodiaEstaVencida(
  horasEnTransito: number | null | undefined,
  umbral = HORAS_ALERTA_CUSTODIA,
): boolean {
  return typeof horasEnTransito === "number" && horasEnTransito >= umbral;
}

/**
 * Cómo debe leerse en pantalla todo lo que la empresa tiene pero no posee: una
 * unidad consignada, y el dinero de su venta que todavía es del consignante.
 *
 * Vive aquí, y no en el módulo de consignación, porque es una etiqueta de
 * presentación que necesitan por igual el inventario y los reportes. Tenerla
 * dos veces permitiría que una pantalla dijera "en resguardo de terceros" y
 * otra dijera otra cosa del mismo vehículo.
 */
export const ETIQUETA_RESGUARDO_TERCEROS = "En resguardo de terceros";

/**
 * Etiqueta de custodia para un RCI-01 / RCI-04. Mientras el custodio no firme,
 * el dinero NO se presenta como resguardado por la empresa: sigue siendo
 * responsabilidad de quien lo entregó, y así debe leerse en pantalla.
 */
export function etiquetaCustodia(custodiaConfirmada: boolean): string {
  return custodiaConfirmada
    ? "Custodia confirmada"
    : "Entregado por el vendedor, pendiente de confirmar custodia";
}

/** Folio tal como se imprime en la forma: CACM-RCI-01-0001. */
export function folioImpreso(tipoCodigo: string, consecutivo: number): string {
  return `${tipoCodigo}-${String(consecutivo).padStart(4, "0")}`;
}

/** Folio con sucursal, para citarlo sin ambigüedad entre agencias. */
export function folioCompleto(
  tipoCodigo: string,
  claveSucursal: string,
  consecutivo: number,
): string {
  return `${tipoCodigo}-${claveSucursal}-${String(consecutivo).padStart(4, "0")}`;
}

/**
 * Presenta el token de un sello en los grupos con los que fue acuñado.
 * Se acepta pegado o con separadores arbitrarios porque quien lo teclea suele
 * copiarlo de un papel impreso.
 */
export function normalizarTokenSello(token: string): string | null {
  const limpio = token.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^CACM[0-9A-HJKMNP-TV-Z]{12}$/.test(limpio)) return null;
  const cuerpo = limpio.slice(4);
  return `CACM-${cuerpo.slice(0, 4)}-${cuerpo.slice(4, 8)}-${cuerpo.slice(8, 12)}`;
}

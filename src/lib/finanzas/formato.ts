import { monedaEnLetras } from "@/lib/numeros";

export const LONGITUD_VIN = 17;

const VIN_VALIDO = /^[A-HJ-NPR-Z0-9]{17}$/;

export function vinEsValido(vin: string): boolean {
  return VIN_VALIDO.test(vin.toUpperCase());
}

export function casillasVin(vin: string | null | undefined): (string | null)[] {
  const limpio = (vin ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, LONGITUD_VIN);
  return Array.from({ length: LONGITUD_VIN }, (_, i) => limpio[i] ?? null);
}

export function vinEnCasillas(vin: string | null | undefined): string {
  return casillasVin(vin)
    .map((c) => c ?? "_")
    .join(" ");
}

export type ImporteEnCasillas = {
  
  pesos: string;
  
  centavos: string;
  
  texto: string;
  
  letra: string;
};

/** Lo que se escribe cuando el importe queda fuera del rango que sabe deletrearse. */
export const IMPORTE_SIN_LETRA = "(IMPORTE FUERA DEL RANGO QUE PUEDE ESCRIBIRSE CON LETRA)";

/**
 * La letra del importe sin poder tumbar la pantalla que lo muestra.
 *
 * `monedaEnLetras` es la autoridad y sigue rechazando lo que no sabe escribir,
 * pero esto es presentación: se llama al pintar cada renglón de importe de cada
 * pantalla, y una excepción aquí no corrige el dato, sólo deja a quien opera
 * ante un error de servidor en vez de ante su cifra. Lo que no se hace es
 * inventar una letra: una equivocada es peor que ninguna.
 */
function letraDelImporte(canonico: string): string {
  try {
    return monedaEnLetras(canonico);
  } catch {
    return IMPORTE_SIN_LETRA;
  }
}

/**
 * Un importe negativo se presenta, no se rechaza: el saldo de un corte, una
 * diferencia de caja y la utilidad de una consigna con pérdida pueden serlo.
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
    // El signo va antes del peso —"-$500.00"—, como en la forma impresa.
    texto: `${signo}$${pesos}.${centavos}`,
    letra: letraDelImporte(`${signo}${entero}.${centavos}`),
  };
}

export const HORAS_ALERTA_CUSTODIA = 4;

export function custodiaEstaVencida(
  horasEnTransito: number | null | undefined,
  umbral = HORAS_ALERTA_CUSTODIA,
): boolean {
  return typeof horasEnTransito === "number" && horasEnTransito >= umbral;
}

export const ETIQUETA_RESGUARDO_TERCEROS = "En resguardo de terceros";

export function etiquetaCustodia(custodiaConfirmada: boolean): string {
  return custodiaConfirmada
    ? "Custodia confirmada"
    : "Entregado por el vendedor, pendiente de confirmar custodia";
}

export function folioImpreso(tipoCodigo: string, consecutivo: number): string {
  return `${tipoCodigo}-${String(consecutivo).padStart(4, "0")}`;
}

export function folioCompleto(
  tipoCodigo: string,
  claveSucursal: string,
  consecutivo: number,
): string {
  return `${tipoCodigo}-${claveSucursal}-${String(consecutivo).padStart(4, "0")}`;
}

export function normalizarTokenSello(token: string): string | null {
  const limpio = token.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^CACM[0-9A-HJKMNP-TV-Z]{12}$/.test(limpio)) return null;
  const cuerpo = limpio.slice(4);
  return `CACM-${cuerpo.slice(0, 4)}-${cuerpo.slice(4, 8)}-${cuerpo.slice(8, 12)}`;
}

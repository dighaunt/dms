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

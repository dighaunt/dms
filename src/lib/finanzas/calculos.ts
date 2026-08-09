

export function aCentavos(valor: string | number | null | undefined): bigint | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const texto = typeof valor === "number" ? valor.toFixed(2) : valor.trim().replace(/,/g, "");
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(texto);
  if (!match) return null;
  const [, signo, entero, decimales] = match;
  const magnitud = BigInt(entero) * 100n + BigInt((decimales ?? "").padEnd(2, "0"));
  return signo === "-" ? -magnitud : magnitud;
}

export function deCentavos(centavos: bigint): string {
  const negativo = centavos < 0n;
  const magnitud = negativo ? -centavos : centavos;
  const enteros = magnitud / 100n;
  const resto = magnitud % 100n;
  return `${negativo ? "-" : ""}${enteros}.${resto.toString().padStart(2, "0")}`;
}

export type GastoConsigna = { concepto: string; importe: string | number };

export type UtilidadConsigna = {
  precioVenta: string;
  montoConsignante: string;
  gastosTotal: string;
  utilidadNeta: string;
  
  esNegativa: boolean;
};

export function utilidadConsigna(entrada: {
  precioVenta: string | number;
  montoConsignante: string | number;
  gastos?: GastoConsigna[];
}): UtilidadConsigna | null {
  const precio = aCentavos(entrada.precioVenta);
  const consignante = aCentavos(entrada.montoConsignante);
  if (precio === null || consignante === null) return null;

  let gastos = 0n;
  for (const gasto of entrada.gastos ?? []) {
    const importe = aCentavos(gasto.importe);
    if (importe === null) return null;
    gastos += importe;
  }

  const utilidad = precio - consignante - gastos;
  return {
    precioVenta: deCentavos(precio),
    montoConsignante: deCentavos(consignante),
    gastosTotal: deCentavos(gastos),
    utilidadNeta: deCentavos(utilidad),
    esNegativa: utilidad < 0n,
  };
}

export const FIRMANTES_VALE_EGRESO = [
  "AUTORIZO_GERENTE",
  "ENTREGO_CUSTODIO",
  "RECIBIO_BENEFICIARIO",
] as const;

export type FirmanteValeEgreso = (typeof FIRMANTES_VALE_EGRESO)[number];

export const EXIGE_USUARIO_INTERNO_VALE: Record<FirmanteValeEgreso, boolean> = {
  AUTORIZO_GERENTE: true,
  ENTREGO_CUSTODIO: true,
  RECIBIO_BENEFICIARIO: false,
};

export type FirmaVale = {
  rolFirmante: string;
  
  usuarioId: number | null;
};

export type EstadoValeEgreso = {
  completo: boolean;
  rolesFaltantes: string[];
  
  firmantesDuplicados: boolean;
  
  rolesSinUsuarioAtribuible: string[];
};

export function estadoValeEgreso(firmas: FirmaVale[]): EstadoValeEgreso {
  const presentes = new Set(firmas.map((f) => f.rolFirmante));
  const rolesFaltantes = FIRMANTES_VALE_EGRESO.filter((rol) => !presentes.has(rol));

  const usuarios = firmas.map((f) => f.usuarioId).filter((id): id is number => id !== null);
  const firmantesDuplicados = new Set(usuarios).size !== usuarios.length;

  
  const rolesSinUsuarioAtribuible = FIRMANTES_VALE_EGRESO.filter(
    (rol) =>
      EXIGE_USUARIO_INTERNO_VALE[rol] &&
      firmas.some((f) => f.rolFirmante === rol && f.usuarioId === null),
  );

  return {
    completo:
      rolesFaltantes.length === 0 && !firmantesDuplicados && rolesSinUsuarioAtribuible.length === 0,
    rolesFaltantes,
    firmantesDuplicados,
    rolesSinUsuarioAtribuible,
  };
}

export type PosicionSocio = {
  totalAnticipos: string;
  totalRepartido: string;
  saldoPorComprobar: string;
  
  tieneSaldoPorComprobar: boolean;
  etiqueta: string;
};

export function posicionSocio(entrada: {
  totalAnticipos: string | number;
  totalRepartido: string | number;
}): PosicionSocio | null {
  const anticipos = aCentavos(entrada.totalAnticipos);
  const repartido = aCentavos(entrada.totalRepartido);
  if (anticipos === null || repartido === null) return null;

  const saldo = anticipos - repartido;
  const tieneSaldo = saldo > 0n;

  return {
    totalAnticipos: deCentavos(anticipos),
    totalRepartido: deCentavos(repartido),
    saldoPorComprobar: deCentavos(saldo > 0n ? saldo : 0n),
    tieneSaldoPorComprobar: tieneSaldo,
    etiqueta: tieneSaldo
      ? "Anticipo a cuenta de utilidades — saldo por comprobar"
      : "Respaldado por reparto formal de utilidades",
  };
}

export type ArqueoCorte = {
  saldoCalculado: string;
  efectivoContado: string;
  diferencia: string;
  cuadra: boolean;
  esFaltante: boolean;
  esSobrante: boolean;
  requiereExplicacion: boolean;
  
  severidadAlerta: "NINGUNA" | "AVISO" | "GRAVE";
};

export function arqueoCorte(entrada: {
  saldoInicial: string | number;
  totalIngresos: string | number;
  totalEgresos: string | number;
  efectivoContado: string | number;
}): ArqueoCorte | null {
  const inicial = aCentavos(entrada.saldoInicial);
  const ingresos = aCentavos(entrada.totalIngresos);
  const egresos = aCentavos(entrada.totalEgresos);
  const contado = aCentavos(entrada.efectivoContado);
  if (inicial === null || ingresos === null || egresos === null || contado === null) return null;

  const calculado = inicial + ingresos - egresos;
  const diferencia = contado - calculado;

  return {
    saldoCalculado: deCentavos(calculado),
    efectivoContado: deCentavos(contado),
    diferencia: deCentavos(diferencia),
    cuadra: diferencia === 0n,
    esFaltante: diferencia < 0n,
    esSobrante: diferencia > 0n,
    requiereExplicacion: diferencia !== 0n,
    severidadAlerta: diferencia < 0n ? "GRAVE" : diferencia > 0n ? "AVISO" : "NINGUNA",
  };
}

export const MINIMO_EXPLICACION_DIFERENCIA = 10;

export function explicacionDiferenciaEsSuficiente(explicacion: string | null | undefined): boolean {
  return (explicacion ?? "").trim().length >= MINIMO_EXPLICACION_DIFERENCIA;
}

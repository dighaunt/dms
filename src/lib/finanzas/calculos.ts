/**
 * Cálculos de las reglas críticas del manual, en centavos enteros.
 *
 * La autoridad sobre estos números es la base de datos: la utilidad de
 * consigna es una columna GENERATED y el saldo del corte lo arma una función
 * SQL. Lo que vive aquí es el mismo cálculo reproducido para que la pantalla
 * pueda mostrar el resultado ANTES de guardar, y para poder probar la regla
 * sin levantar una base.
 *
 * Se opera con BigInt sobre centavos y nunca con Number: 0.1 + 0.2 no da 0.3
 * en punto flotante, y estos importes terminan en un documento que declara
 * cuánto dinero se entregó.
 */

/** Convierte "12,345.67" a 1234567n. Devuelve null si no es un decimal válido. */
export function aCentavos(valor: string | number | null | undefined): bigint | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const texto = typeof valor === "number" ? valor.toFixed(2) : valor.trim().replace(/,/g, "");
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(texto);
  if (!match) return null;
  const [, signo, entero, decimales] = match;
  const magnitud = BigInt(entero) * 100n + BigInt((decimales ?? "").padEnd(2, "0"));
  return signo === "-" ? -magnitud : magnitud;
}

/** Vuelve a la representación decimal que espera numeric(18,2). */
export function deCentavos(centavos: bigint): string {
  const negativo = centavos < 0n;
  const magnitud = negativo ? -centavos : centavos;
  const enteros = magnitud / 100n;
  const resto = magnitud % 100n;
  return `${negativo ? "-" : ""}${enteros}.${resto.toString().padStart(2, "0")}`;
}

// ===== Regla 3 — la utilidad de consigna la calcula el sistema =====

export type GastoConsigna = { concepto: string; importe: string | number };

export type UtilidadConsigna = {
  precioVenta: string;
  montoConsignante: string;
  gastosTotal: string;
  utilidadNeta: string;
  /** El manual llama a esto "ingreso limpio" de la comisión mercantil. */
  esNegativa: boolean;
};

/**
 * utilidad_neta = precio_venta − monto_consignante − gastos.
 *
 * Una utilidad negativa no se rechaza: puede ocurrir de verdad si los gastos
 * se comieron el margen. Lo que hace el sistema es señalarla, porque una
 * consigna que deja pérdida es justo lo que un socio necesita ver.
 */
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

// ===== Regla 4 — ningún egreso sin tres firmantes distintos =====

export const FIRMANTES_VALE_EGRESO = [
  "AUTORIZO_GERENTE",
  "ENTREGO_CUSTODIO",
  "RECIBIO_BENEFICIARIO",
] as const;

export type FirmaVale = {
  rolFirmante: string;
  /** Nulo cuando firma un tercero de forma presencial. */
  usuarioId: number | null;
};

export type EstadoValeEgreso = {
  completo: boolean;
  rolesFaltantes: string[];
  /** Dos roles ocupados por la misma persona rompen la segregación. */
  firmantesDuplicados: boolean;
};

/**
 * Un vale sólo autoriza una salida de efectivo cuando están las tres firmas
 * y las tres corresponden a personas distintas. La base lo impone con un
 * índice único parcial; esto permite decírselo a quien captura antes de que
 * intente firmar.
 */
export function estadoValeEgreso(firmas: FirmaVale[]): EstadoValeEgreso {
  const presentes = new Set(firmas.map((f) => f.rolFirmante));
  const rolesFaltantes = FIRMANTES_VALE_EGRESO.filter((rol) => !presentes.has(rol));

  const usuarios = firmas.map((f) => f.usuarioId).filter((id): id is number => id !== null);
  const firmantesDuplicados = new Set(usuarios).size !== usuarios.length;

  return {
    completo: rolesFaltantes.length === 0 && !firmantesDuplicados,
    rolesFaltantes,
    firmantesDuplicados,
  };
}

// ===== Regla 5 — el retiro de un socio es anticipo, no reparto =====

export type PosicionSocio = {
  totalAnticipos: string;
  totalRepartido: string;
  saldoPorComprobar: string;
  /** Verdadero mientras exista retiro sin balance formal que lo respalde. */
  tieneSaldoPorComprobar: boolean;
  etiqueta: string;
};

/**
 * El artículo 19 de la LGSM sólo admite reparto de utilidades después de un
 * balance que efectivamente las arroje. Hasta que ese reparto exista, lo
 * retirado por un socio es un anticipo a cuenta: saldo POR COMPROBAR, nunca
 * gasto cerrado. Presentarlo de otro modo daría por repartida una utilidad
 * que ningún estado financiero respalda.
 */
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

// ===== Regla 7 — la diferencia de caja se explica o no cierra el día =====

export type ArqueoCorte = {
  saldoCalculado: string;
  efectivoContado: string;
  diferencia: string;
  cuadra: boolean;
  esFaltante: boolean;
  esSobrante: boolean;
  requiereExplicacion: boolean;
  /** Un faltante escala al Gerente General; un sobrante sólo avisa. */
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

/** Longitud mínima que la función SQL exige a la explicación de la diferencia. */
export const MINIMO_EXPLICACION_DIFERENCIA = 10;

export function explicacionDiferenciaEsSuficiente(explicacion: string | null | undefined): boolean {
  return (explicacion ?? "").trim().length >= MINIMO_EXPLICACION_DIFERENCIA;
}

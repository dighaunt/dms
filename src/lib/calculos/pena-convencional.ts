export type CampoCalculoPena = {
  name: string;
  label: string;
};

export type ConfiguracionCalculoPena = {
  version: "PENA_CONVENCIONAL_V1";
  tipo: "C-01";
  section: string;
  order: number;
  titulo: string;
  formula: string;
  base: CampoCalculoPena;
  obligacionPrincipal: CampoCalculoPena;
  /** Campo del PDF que recibe el porcentaje derivado por el sistema. */
  porcentaje: CampoCalculoPena;
  /** Política contractual; nunca proviene de la captura del usuario. */
  porcentajeFijo: string;
  devuelveSaldo: boolean;
};

export type VistaCalculoPena = {
  estado: "PENDIENTE" | "RESUELTO";
  faltantes: CampoCalculoPena[];
  montoBase?: string;
  obligacionPrincipal?: string;
  porcentaje?: string;
  montoPena?: string;
  montoDevolucion?: string;
};

const CONFIGURACION_C01: ConfiguracionCalculoPena = {
  version: "PENA_CONVENCIONAL_V1",
  tipo: "C-01",
  section: "parte_iii_clausulas",
  order: 36,
  titulo: "Pena convencional del apartado",
  formula: "P = min((p / 100) x A, OP)",
  base: { name: "c01_monto_num", label: "Monto del apartado (A)" },
  obligacionPrincipal: { name: "c01_precio_total", label: "Precio total pactado (OP)" },
  porcentaje: { name: "C01_inl_30", label: "Porcentaje contractual de pena" },
  porcentajeFijo: "50",
  devuelveSaldo: true,
};

export function configuracionCalculoPena(tipo: string): ConfiguracionCalculoPena | undefined {
  return tipo === "C-01" ? CONFIGURACION_C01 : undefined;
}

function decimalesACentavos(valor: string | undefined): bigint | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec((valor ?? "").trim().replace(/,/g, ""));
  if (!match) return null;
  return BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
}

function formatearCentavos(centavos: bigint): string {
  const negativo = centavos < 0n;
  const absoluto = negativo ? -centavos : centavos;
  const entero = (absoluto / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraccion = (absoluto % 100n).toString().padStart(2, "0");
  return `${negativo ? "-" : ""}$${entero}.${fraccion} MXN`;
}

function formatearPorcentaje(cienavos: bigint): string {
  const entero = cienavos / 100n;
  const fraccion = (cienavos % 100n).toString().padStart(2, "0").replace(/0+$/, "");
  return `${entero.toString()}${fraccion ? `.${fraccion}` : ""}%`;
}

export function formatearMontoCalculo(valor: string): string {
  const centavos = decimalesACentavos(valor);
  return centavos === null ? valor : formatearCentavos(centavos);
}

export function formatearPorcentajeCalculo(valor: string): string {
  const cienavos = decimalesACentavos(valor);
  return cienavos === null ? valor : formatearPorcentaje(cienavos);
}

/**
 * Calcula en centavos con BigInt para que la vista previa no pierda precisión
 * con los importes admitidos por numeric(18,2). La base autoritativa es el
 * trigger de Neon; esta función únicamente reproduce la regla en la UI.
 */
export function vistaCalculoPena(
  configuracion: ConfiguracionCalculoPena,
  values: Record<string, string>,
): VistaCalculoPena {
  const faltantes: CampoCalculoPena[] = [];
  const montoBase = decimalesACentavos(values[configuracion.base.name]);
  const obligacionPrincipal = decimalesACentavos(values[configuracion.obligacionPrincipal.name]);
  const porcentaje = decimalesACentavos(
    configuracion.porcentajeFijo,
  );

  if (montoBase === null) faltantes.push(configuracion.base);
  if (obligacionPrincipal === null && configuracion.obligacionPrincipal.name !== configuracion.base.name) {
    faltantes.push(configuracion.obligacionPrincipal);
  }
  if (montoBase === null || obligacionPrincipal === null || porcentaje === null) {
    return { estado: "PENDIENTE", faltantes };
  }

  // porcentaje está en centésimas de punto porcentual: 12.50% = 1,250.
  // Redondeo comercial a dos decimales, igual que numeric(18,2) en el motor SQL.
  const penaSinTope = (montoBase * porcentaje + 5_000n) / 10_000n;
  const montoPena = penaSinTope > obligacionPrincipal ? obligacionPrincipal : penaSinTope;
  return {
    estado: "RESUELTO",
    faltantes: [],
    montoBase: formatearCentavos(montoBase),
    obligacionPrincipal: formatearCentavos(obligacionPrincipal),
    porcentaje: formatearPorcentaje(porcentaje),
    montoPena: formatearCentavos(montoPena),
    ...(configuracion.devuelveSaldo
      ? { montoDevolucion: formatearCentavos(montoBase - montoPena) }
      : {}),
  };
}

import "server-only";

import { z } from "zod";

import { query } from "@/lib/db";
import { aCentavos, deCentavos, posicionSocio, type PosicionSocio } from "@/lib/finanzas/calculos";
import { ETIQUETA_RESGUARDO_TERCEROS } from "@/lib/finanzas/formato";
import { esquemaFechaIso, esquemaId, type TipoRci } from "@/lib/finanzas/tipos";

export { ETIQUETA_RESGUARDO_TERCEROS };

export const CONCEPTOS_INGRESO = ["VENTAS_CONTADO", "UTILIDAD_CONSIGNA", "SERVICIO"] as const;

export type ConceptoIngreso = (typeof CONCEPTOS_INGRESO)[number];

const FICHA_CONCEPTO_INGRESO: Record<
  ConceptoIngreso,
  { etiqueta: string; tipoCodigo: TipoRci; orden: number }
> = {
  VENTAS_CONTADO: {
    etiqueta: "Ventas de contado",
    tipoCodigo: "CACM-RCI-01",
    orden: 1,
  },
  UTILIDAD_CONSIGNA: {
    etiqueta: "Liquidaciones de consigna — utilidad neta",
    tipoCodigo: "CACM-RCI-03",
    orden: 2,
  },
  SERVICIO: {
    etiqueta: "Ingresos por servicio",
    tipoCodigo: "CACM-RCI-04",
    orden: 3,
  },
};

const ETIQUETA_UBICACION: Record<string, string> = {
  CAJA_FISICA: "En caja física",
  BANCO: "Depositado en banco",
  TRANSITO: "En tránsito / por depositar",
  OTRO: "Otro resguardo",
};

const CERO = "0.00";

function aNumero(valor: string | number | null): number {
  return valor === null ? 0 : typeof valor === "number" ? valor : Number(valor);
}

function aImporte(valor: string | null): string {
  return valor ?? CERO;
}

function centavos(valor: string | null | undefined): bigint {
  return aCentavos(valor ?? CERO) ?? 0n;
}

function sumar(importes: Iterable<string>): string {
  let total = 0n;
  for (const importe of importes) total += centavos(importe);
  return deCentavos(total);
}

export const esquemaRangoReporte = z
  .object({
    
    sucursalId: esquemaId.nullish().transform((valor) => valor ?? null),
    desde: esquemaFechaIso,
    hasta: esquemaFechaIso,
  })
  .refine((rango) => rango.desde <= rango.hasta, {
    message: "La fecha inicial no puede ser posterior a la final",
    path: ["desde"],
  });

export type EntradaRangoReporte = z.input<typeof esquemaRangoReporte>;
export type RangoReporte = z.output<typeof esquemaRangoReporte>;

export function rangoPorOmision(): { desde: string; hasta: string } {
  const hoy = new Date();
  const iso = hoy.toISOString().slice(0, 10);
  return { desde: `${iso.slice(0, 7)}-01`, hasta: iso };
}

export type RenglonIngreso = {
  concepto: ConceptoIngreso;
  etiqueta: string;
  tipoCodigo: TipoRci;
  documentos: number;
  importe: string;
  
  importeEfectivo: string;
  
  importeOtrasFormas: string;
};

export type TotalPorSucursal = {
  sucursalId: number;
  clave: string;
  nombre: string;
  documentos: number;
  importe: string;
};

export type DesgloseConsignacion = {
  liquidaciones: number;
  
  precioVentaTotal: string;
  
  montoConsignanteTotal: string;
  gastosTotal: string;
  
  utilidadNetaTotal: string;
  
  etiquetaResguardo: string;
  
  conUtilidadNegativa: number;
};

export type ReporteIngresos = {
  rango: RangoReporte;
  renglones: RenglonIngreso[];
  porSucursal: TotalPorSucursal[];
  documentos: number;
  total: string;
  totalEfectivo: string;
  totalOtrasFormas: string;
  consignacion: DesgloseConsignacion;
};

type FilaIngreso = {
  sucursal_id: string | number;
  sucursal_clave: string;
  sucursal_nombre: string;
  concepto: string;
  documentos: string | number;
  total: string | null;
  total_efectivo: string | null;
};

export async function ingresosPorTipo(entrada: EntradaRangoReporte): Promise<ReporteIngresos> {
  const rango = esquemaRangoReporte.parse(entrada);
  const parametros = [rango.desde, rango.hasta, rango.sucursalId];

  const { rows } = await query<FilaIngreso>(
    `WITH movimiento AS (
        -- El RCI-01 es efectivo por definición del formato: es la entrega
        -- física del dinero cobrado, con su desglose de denominaciones.
        SELECT d.sucursal_id, d.sucursal_clave, d.sucursal_nombre,
               'VENTAS_CONTADO'::text AS concepto,
               r.importe_total AS importe,
               true AS afecta_caja
          FROM traza.recibo_caja_rci01 r
          JOIN traza.v_documento_financiero d ON d.id = r.documento_id
         WHERE d.estado = 'FIRMADO'
           AND r.fecha_hora_cobro::date BETWEEN $1::date AND $2::date
           AND ($3::bigint IS NULL OR d.sucursal_id = $3::bigint)
        UNION ALL
        -- De una consigna entra la utilidad neta y NADA más: el resto del
        -- precio es dinero de un tercero que sólo pasó por la empresa.
        SELECT d.sucursal_id, d.sucursal_clave, d.sucursal_nombre,
               'UTILIDAD_CONSIGNA', l.utilidad_neta, f.afecta_caja_fisica
          FROM traza.liquidacion_consigna_rci03 l
          JOIN traza.v_documento_financiero d ON d.id = l.documento_id
          JOIN traza.forma_pago_fin f ON f.codigo = l.forma_ingreso_tesoreria
         WHERE d.estado = 'FIRMADO'
           AND d.creado_en::date BETWEEN $1::date AND $2::date
           AND ($3::bigint IS NULL OR d.sucursal_id = $3::bigint)
        UNION ALL
        SELECT d.sucursal_id, d.sucursal_clave, d.sucursal_nombre,
               'SERVICIO', s.importe_total, f.afecta_caja_fisica
          FROM traza.ingreso_servicio_rci04 s
          JOIN traza.v_documento_financiero d ON d.id = s.documento_id
          JOIN traza.forma_pago_fin f ON f.codigo = s.forma_pago
         WHERE d.estado = 'FIRMADO'
           AND s.fecha_hora_cobro::date BETWEEN $1::date AND $2::date
           AND ($3::bigint IS NULL OR d.sucursal_id = $3::bigint)
     )
     SELECT m.sucursal_id,
            m.sucursal_clave,
            m.sucursal_nombre,
            m.concepto,
            count(*) AS documentos,
            sum(m.importe)::text AS total,
            COALESCE(sum(m.importe) FILTER (WHERE m.afecta_caja), 0)::text AS total_efectivo
       FROM movimiento m
      GROUP BY m.sucursal_id, m.sucursal_clave, m.sucursal_nombre, m.concepto
      ORDER BY m.sucursal_clave, m.concepto`,
    parametros,
  );

  const porConcepto = new Map<ConceptoIngreso, RenglonIngreso>();
  const porSucursal = new Map<number, TotalPorSucursal>();

  for (const fila of rows) {
    const concepto = fila.concepto as ConceptoIngreso;
    const ficha = FICHA_CONCEPTO_INGRESO[concepto];
    const documentos = aNumero(fila.documentos);
    const importe = aImporte(fila.total);
    const efectivo = aImporte(fila.total_efectivo);

    const renglon = porConcepto.get(concepto) ?? {
      concepto,
      etiqueta: ficha.etiqueta,
      tipoCodigo: ficha.tipoCodigo,
      documentos: 0,
      importe: CERO,
      importeEfectivo: CERO,
      importeOtrasFormas: CERO,
    };
    renglon.documentos += documentos;
    renglon.importe = sumar([renglon.importe, importe]);
    renglon.importeEfectivo = sumar([renglon.importeEfectivo, efectivo]);
    renglon.importeOtrasFormas = deCentavos(
      centavos(renglon.importe) - centavos(renglon.importeEfectivo),
    );
    porConcepto.set(concepto, renglon);

    const sucursalId = aNumero(fila.sucursal_id);
    const acumulado = porSucursal.get(sucursalId) ?? {
      sucursalId,
      clave: fila.sucursal_clave,
      nombre: fila.sucursal_nombre,
      documentos: 0,
      importe: CERO,
    };
    acumulado.documentos += documentos;
    acumulado.importe = sumar([acumulado.importe, importe]);
    porSucursal.set(sucursalId, acumulado);
  }

  const renglones = [...porConcepto.values()].sort(
    (a, b) => FICHA_CONCEPTO_INGRESO[a.concepto].orden - FICHA_CONCEPTO_INGRESO[b.concepto].orden,
  );

  const total = sumar(renglones.map((r) => r.importe));
  const totalEfectivo = sumar(renglones.map((r) => r.importeEfectivo));

  return {
    rango,
    renglones,
    porSucursal: [...porSucursal.values()].sort((a, b) => a.clave.localeCompare(b.clave)),
    documentos: renglones.reduce((suma, r) => suma + r.documentos, 0),
    total,
    totalEfectivo,
    totalOtrasFormas: deCentavos(centavos(total) - centavos(totalEfectivo)),
    consignacion: await desgloseConsignacion(rango),
  };
}

async function desgloseConsignacion(rango: RangoReporte): Promise<DesgloseConsignacion> {
  const { rows } = await query<{
    liquidaciones: string | number;
    precio_venta: string | null;
    monto_consignante: string | null;
    gastos: string | null;
    utilidad: string | null;
    negativas: string | number;
  }>(
    `SELECT count(*) AS liquidaciones,
            sum(l.precio_venta_final)::text AS precio_venta,
            sum(l.monto_consignante)::text  AS monto_consignante,
            sum(l.gastos_total)::text       AS gastos,
            sum(l.utilidad_neta)::text      AS utilidad,
            count(*) FILTER (WHERE l.utilidad_neta < 0) AS negativas
       FROM traza.liquidacion_consigna_rci03 l
       JOIN traza.v_documento_financiero d ON d.id = l.documento_id
      WHERE d.estado = 'FIRMADO'
        AND d.creado_en::date BETWEEN $1::date AND $2::date
        AND ($3::bigint IS NULL OR d.sucursal_id = $3::bigint)`,
    [rango.desde, rango.hasta, rango.sucursalId],
  );

  const fila = rows[0];
  return {
    liquidaciones: aNumero(fila?.liquidaciones ?? 0),
    precioVentaTotal: aImporte(fila?.precio_venta ?? null),
    montoConsignanteTotal: aImporte(fila?.monto_consignante ?? null),
    gastosTotal: aImporte(fila?.gastos ?? null),
    utilidadNetaTotal: aImporte(fila?.utilidad ?? null),
    etiquetaResguardo: ETIQUETA_RESGUARDO_TERCEROS,
    conUtilidadNegativa: aNumero(fila?.negativas ?? 0),
  };
}

export type RenglonEgreso = {
  conceptoCodigo: string;
  etiqueta: string;
  documentos: number;
  importe: string;
  
  importeEfectivo: string;
  importeOtrasFormas: string;
  
  esAnticipoUtilidades: boolean;
};

export type ReporteEgresos = {
  rango: RangoReporte;
  renglones: RenglonEgreso[];
  porSucursal: TotalPorSucursal[];
  documentos: number;
  total: string;
  totalEfectivo: string;
  totalOtrasFormas: string;
  
  totalAnticipoUtilidades: string;
};

type FilaEgreso = {
  sucursal_id: string | number;
  sucursal_clave: string;
  sucursal_nombre: string;
  concepto_codigo: string;
  etiqueta: string;
  orden: number;
  es_anticipo_utilidades: boolean;
  documentos: string | number;
  total: string | null;
  total_efectivo: string | null;
};

export async function egresosPorTipo(entrada: EntradaRangoReporte): Promise<ReporteEgresos> {
  const rango = esquemaRangoReporte.parse(entrada);

  const { rows } = await query<FilaEgreso>(
    `SELECT d.sucursal_id,
            d.sucursal_clave,
            d.sucursal_nombre,
            v.concepto_codigo,
            c.etiqueta,
            c.orden,
            c.es_anticipo_utilidades,
            count(*) AS documentos,
            sum(v.importe)::text AS total,
            COALESCE(sum(v.importe) FILTER (WHERE f.afecta_caja_fisica), 0)::text AS total_efectivo
       FROM traza.vale_egreso_rci05 v
       JOIN traza.v_documento_financiero d ON d.id = v.documento_id
       JOIN traza.concepto_egreso c ON c.codigo = v.concepto_codigo
       JOIN traza.forma_pago_fin f ON f.codigo = v.forma_pago
      WHERE d.estado = 'FIRMADO'
        AND v.fecha_hora::date BETWEEN $1::date AND $2::date
        AND ($3::bigint IS NULL OR d.sucursal_id = $3::bigint)
      GROUP BY d.sucursal_id, d.sucursal_clave, d.sucursal_nombre,
               v.concepto_codigo, c.etiqueta, c.orden, c.es_anticipo_utilidades
      ORDER BY c.orden, d.sucursal_clave`,
    [rango.desde, rango.hasta, rango.sucursalId],
  );

  const porConcepto = new Map<string, RenglonEgreso>();

  const ordenDelConcepto = new Map<string, number>();
  const porSucursal = new Map<number, TotalPorSucursal>();

  for (const fila of rows) {
    const documentos = aNumero(fila.documentos);
    const importe = aImporte(fila.total);
    const efectivo = aImporte(fila.total_efectivo);

    ordenDelConcepto.set(fila.concepto_codigo, fila.orden);
    const renglon = porConcepto.get(fila.concepto_codigo) ?? {
      conceptoCodigo: fila.concepto_codigo,
      etiqueta: fila.etiqueta,
      documentos: 0,
      importe: CERO,
      importeEfectivo: CERO,
      importeOtrasFormas: CERO,
      esAnticipoUtilidades: fila.es_anticipo_utilidades,
    };
    renglon.documentos += documentos;
    renglon.importe = sumar([renglon.importe, importe]);
    renglon.importeEfectivo = sumar([renglon.importeEfectivo, efectivo]);
    renglon.importeOtrasFormas = deCentavos(
      centavos(renglon.importe) - centavos(renglon.importeEfectivo),
    );
    porConcepto.set(fila.concepto_codigo, renglon);

    const sucursalId = aNumero(fila.sucursal_id);
    const acumulado = porSucursal.get(sucursalId) ?? {
      sucursalId,
      clave: fila.sucursal_clave,
      nombre: fila.sucursal_nombre,
      documentos: 0,
      importe: CERO,
    };
    acumulado.documentos += documentos;
    acumulado.importe = sumar([acumulado.importe, importe]);
    porSucursal.set(sucursalId, acumulado);
  }

  const renglones = [...porConcepto.values()].sort(
    (a, b) =>
      (ordenDelConcepto.get(a.conceptoCodigo) ?? 0) -
      (ordenDelConcepto.get(b.conceptoCodigo) ?? 0),
  );

  const total = sumar(renglones.map((r) => r.importe));
  const totalEfectivo = sumar(renglones.map((r) => r.importeEfectivo));

  return {
    rango,
    renglones,
    porSucursal: [...porSucursal.values()].sort((a, b) => a.clave.localeCompare(b.clave)),
    documentos: renglones.reduce((suma, r) => suma + r.documentos, 0),
    total,
    totalEfectivo,
    totalOtrasFormas: deCentavos(centavos(total) - centavos(totalEfectivo)),
    totalAnticipoUtilidades: sumar(
      renglones.filter((r) => r.esAnticipoUtilidades).map((r) => r.importe),
    ),
  };
}

export type DiferenciaDeCaja = {
  documentoId: number;
  folio: string;
  folioCompleto: string;
  sucursalId: number;
  sucursalClave: string;
  sucursalNombre: string;
  fechaCorte: string;
  turno: string | null;
  custodioId: number;
  custodioNombre: string;
  saldoCalculado: string;
  efectivoContado: string;
  
  diferencia: string;
  explicacion: string | null;
  cuadra: boolean;
  esFaltante: boolean;
};

export type PatronDiferencias = {
  clave: string;
  nombre: string;
  cortes: number;
  cortesConDiferencia: number;
  faltantes: number;
  sobrantes: number;
  
  totalFaltante: string;
  totalSobrante: string;
  
  neto: string;
  
  sinExplicacion: number;
};

export type ReporteDiferencias = {
  rango: RangoReporte;
  cortes: DiferenciaDeCaja[];
  porSucursal: PatronDiferencias[];
  porCustodio: PatronDiferencias[];
  cortesFirmados: number;
  cortesConDiferencia: number;
  totalFaltante: string;
  totalSobrante: string;
  neto: string;
};

type FilaDiferencia = {
  documento_id: string | number;
  folio: string;
  folio_completo: string;
  sucursal_id: string | number;
  sucursal_clave: string;
  sucursal_nombre: string;
  fecha_corte: string;
  turno: string | null;
  custodio_id: string | number;
  custodio_nombre: string;
  saldo_calculado: string;
  efectivo_contado: string;
  diferencia: string;
  explicacion_diferencia: string | null;
};

function acumularPatron(
  mapa: Map<string, PatronDiferencias>,
  llave: string,
  identidad: { clave: string; nombre: string },
  corte: DiferenciaDeCaja,
): void {
  const patron = mapa.get(llave) ?? {
    clave: identidad.clave,
    nombre: identidad.nombre,
    cortes: 0,
    cortesConDiferencia: 0,
    faltantes: 0,
    sobrantes: 0,
    totalFaltante: CERO,
    totalSobrante: CERO,
    neto: CERO,
    sinExplicacion: 0,
  };

  const diferencia = centavos(corte.diferencia);
  patron.cortes += 1;
  patron.neto = deCentavos(centavos(patron.neto) + diferencia);

  if (diferencia !== 0n) {
    patron.cortesConDiferencia += 1;
    if ((corte.explicacion ?? "").trim() === "") patron.sinExplicacion += 1;
    if (diferencia < 0n) {
      patron.faltantes += 1;
      patron.totalFaltante = deCentavos(centavos(patron.totalFaltante) - diferencia);
    } else {
      patron.sobrantes += 1;
      patron.totalSobrante = deCentavos(centavos(patron.totalSobrante) + diferencia);
    }
  }

  mapa.set(llave, patron);
}

export async function historialDiferencias(
  entrada: EntradaRangoReporte,
): Promise<ReporteDiferencias> {
  const rango = esquemaRangoReporte.parse(entrada);

  const { rows } = await query<FilaDiferencia>(
    `SELECT c.documento_id,
            d.folio,
            d.folio_completo,
            d.sucursal_id,
            d.sucursal_clave,
            d.sucursal_nombre,
            c.fecha_corte::text AS fecha_corte,
            c.turno,
            c.custodio_usuario_id AS custodio_id,
            u.nombre AS custodio_nombre,
            c.saldo_calculado::text,
            c.efectivo_contado::text,
            c.diferencia::text,
            c.explicacion_diferencia
       FROM traza.corte_caja_rci07 c
       JOIN traza.v_documento_financiero d ON d.id = c.documento_id
       JOIN traza.usuario u ON u.id = c.custodio_usuario_id
      WHERE d.estado = 'FIRMADO'
        -- Un corte firmado siempre tiene arqueo; el guardia evita que un dato
        -- incompleto se lea como un día que cuadró en cero.
        AND c.efectivo_contado IS NOT NULL
        AND c.fecha_corte BETWEEN $1::date AND $2::date
        AND ($3::bigint IS NULL OR c.sucursal_id = $3::bigint)
      ORDER BY c.fecha_corte DESC, d.sucursal_clave, c.turno NULLS FIRST`,
    [rango.desde, rango.hasta, rango.sucursalId],
  );

  const cortes: DiferenciaDeCaja[] = rows.map((fila) => {
    const diferencia = fila.diferencia;
    return {
      documentoId: aNumero(fila.documento_id),
      folio: fila.folio,
      folioCompleto: fila.folio_completo,
      sucursalId: aNumero(fila.sucursal_id),
      sucursalClave: fila.sucursal_clave,
      sucursalNombre: fila.sucursal_nombre,
      fechaCorte: fila.fecha_corte,
      turno: fila.turno,
      custodioId: aNumero(fila.custodio_id),
      custodioNombre: fila.custodio_nombre,
      saldoCalculado: fila.saldo_calculado,
      efectivoContado: fila.efectivo_contado,
      diferencia,
      explicacion: fila.explicacion_diferencia,
      cuadra: centavos(diferencia) === 0n,
      esFaltante: centavos(diferencia) < 0n,
    };
  });

  const porSucursal = new Map<string, PatronDiferencias>();
  const porCustodio = new Map<string, PatronDiferencias>();

  for (const corte of cortes) {
    acumularPatron(
      porSucursal,
      String(corte.sucursalId),
      { clave: corte.sucursalClave, nombre: corte.sucursalNombre },
      corte,
    );
    acumularPatron(
      porCustodio,
      String(corte.custodioId),
      { clave: corte.custodioNombre, nombre: corte.custodioNombre },
      corte,
    );
  }

  const ordenarPorFaltante = (a: PatronDiferencias, b: PatronDiferencias) => {
    const diferencia = centavos(b.totalFaltante) - centavos(a.totalFaltante);
    return diferencia === 0n ? a.clave.localeCompare(b.clave) : diferencia > 0n ? 1 : -1;
  };

  const conDiferencia = cortes.filter((c) => !c.cuadra);

  return {
    rango,
    cortes,
    porSucursal: [...porSucursal.values()].sort(ordenarPorFaltante),
    porCustodio: [...porCustodio.values()].sort(ordenarPorFaltante),
    cortesFirmados: cortes.length,
    cortesConDiferencia: conDiferencia.length,
    totalFaltante: deCentavos(
      conDiferencia
        .filter((c) => c.esFaltante)
        .reduce((suma, c) => suma - centavos(c.diferencia), 0n),
    ),
    totalSobrante: sumar(conDiferencia.filter((c) => !c.esFaltante).map((c) => c.diferencia)),
    neto: sumar(cortes.map((c) => c.diferencia)),
  };
}

export type CuentaBancaria = {
  institucion: string;
  cuenta: string;
  monto: string;
  
  ultimaFecha: string | null;
  depositos: number;
};

export type PosicionSucursal = {
  sucursalId: number;
  clave: string;
  nombre: string;
  
  corteDocumentoId: number | null;
  folio: string | null;
  fechaCorte: string | null;
  turno: string | null;
  cajaFisica: string;
  banco: string;
  transito: string;
  otro: string;
  total: string;
  cuentas: CuentaBancaria[];
  otrosResguardos: { etiqueta: string; monto: string; detalle: string | null }[];
};

export type ReportePosicionEfectivo = {
  rango: RangoReporte;
  
  corteHasta: string;
  sucursales: PosicionSucursal[];
  cuentas: CuentaBancaria[];
  totales: {
    cajaFisica: string;
    banco: string;
    transito: string;
    otro: string;
    total: string;
  };
  sucursalesSinCorte: string[];
  
  fechasDeCorte: string[];
};

type FilaPosicion = {
  sucursal_id: string | number;
  clave: string;
  nombre: string;
  corte_documento_id: string | number | null;
  folio: string | null;
  fecha_corte: string | null;
  turno: string | null;
  ubicacion: string | null;
  institucion: string | null;
  cuenta: string | null;
  fecha: string | null;
  monto: string | null;
  detalle: string | null;
};

export async function posicionEfectivo(
  entrada: EntradaRangoReporte,
): Promise<ReportePosicionEfectivo> {
  const rango = esquemaRangoReporte.parse(entrada);

  const { rows } = await query<FilaPosicion>(
    `WITH ultimo_corte AS (
        SELECT DISTINCT ON (c.sucursal_id)
               c.sucursal_id, c.documento_id, c.fecha_corte, c.turno, d.folio
          FROM traza.corte_caja_rci07 c
          JOIN traza.v_documento_financiero d ON d.id = c.documento_id
         WHERE d.estado = 'FIRMADO'
           AND c.fecha_corte <= $1::date
           AND ($2::bigint IS NULL OR c.sucursal_id = $2::bigint)
         ORDER BY c.sucursal_id, c.fecha_corte DESC, c.documento_id DESC
     )
     SELECT s.id AS sucursal_id,
            s.clave,
            s.nombre,
            uc.documento_id AS corte_documento_id,
            uc.folio,
            uc.fecha_corte::text AS fecha_corte,
            uc.turno,
            u.ubicacion,
            u.institucion,
            u.cuenta,
            u.fecha::text AS fecha,
            u.monto::text AS monto,
            u.detalle
       FROM traza.sucursal s
       LEFT JOIN ultimo_corte uc ON uc.sucursal_id = s.id
       LEFT JOIN traza.v_corte_ubicacion_efectivo u ON u.documento_id = uc.documento_id
      -- Una sucursal dada de baja puede conservar dinero declarado en su
      -- último corte: se sigue reportando aunque ya no opere.
      WHERE (s.activa OR uc.documento_id IS NOT NULL)
        AND ($2::bigint IS NULL OR s.id = $2::bigint)
      ORDER BY s.clave, u.ubicacion`,
    [rango.hasta, rango.sucursalId],
  );

  const sucursales = new Map<number, PosicionSucursal>();
  
  const cuentasPorSucursal = new Map<number, Map<string, CuentaBancaria>>();
  const cuentasGlobales = new Map<string, CuentaBancaria>();

  function acumularCuenta(
    mapa: Map<string, CuentaBancaria>,
    llave: string,
    institucion: string,
    cuenta: string,
    monto: string,
    fecha: string | null,
  ): void {
    const registro = mapa.get(llave) ?? {
      institucion,
      cuenta,
      monto: CERO,
      ultimaFecha: null,
      depositos: 0,
    };
    registro.monto = sumar([registro.monto, monto]);
    registro.depositos += 1;
    if (fecha && (registro.ultimaFecha === null || fecha > registro.ultimaFecha)) {
      registro.ultimaFecha = fecha;
    }
    mapa.set(llave, registro);
  }

  for (const fila of rows) {
    const sucursalId = aNumero(fila.sucursal_id);
    const posicion = sucursales.get(sucursalId) ?? {
      sucursalId,
      clave: fila.clave,
      nombre: fila.nombre,
      corteDocumentoId: fila.corte_documento_id === null ? null : aNumero(fila.corte_documento_id),
      folio: fila.folio,
      fechaCorte: fila.fecha_corte,
      turno: fila.turno,
      cajaFisica: CERO,
      banco: CERO,
      transito: CERO,
      otro: CERO,
      total: CERO,
      cuentas: [],
      otrosResguardos: [],
    };

    
    if (fila.ubicacion !== null && fila.monto !== null) {
      const monto = fila.monto;
      posicion.total = sumar([posicion.total, monto]);

      switch (fila.ubicacion) {
        case "CAJA_FISICA":
          posicion.cajaFisica = sumar([posicion.cajaFisica, monto]);
          break;
        case "BANCO": {
          posicion.banco = sumar([posicion.banco, monto]);
          const institucion = fila.institucion ?? "(sin institución)";
          const cuenta = fila.cuenta ?? "(sin cuenta)";
          const llave = `${institucion}|${cuenta}`;

          const deSucursal = cuentasPorSucursal.get(sucursalId) ?? new Map<string, CuentaBancaria>();
          acumularCuenta(deSucursal, llave, institucion, cuenta, monto, fila.fecha);
          cuentasPorSucursal.set(sucursalId, deSucursal);
          posicion.cuentas = [...deSucursal.values()];

          acumularCuenta(cuentasGlobales, llave, institucion, cuenta, monto, fila.fecha);
          break;
        }
        case "TRANSITO":
          posicion.transito = sumar([posicion.transito, monto]);
          posicion.otrosResguardos.push({
            etiqueta: ETIQUETA_UBICACION.TRANSITO,
            monto,
            detalle: fila.detalle,
          });
          break;
        default:
          posicion.otro = sumar([posicion.otro, monto]);
          posicion.otrosResguardos.push({
            etiqueta: ETIQUETA_UBICACION[fila.ubicacion] ?? fila.ubicacion,
            monto,
            detalle: fila.detalle,
          });
      }
    }

    sucursales.set(sucursalId, posicion);
  }

  const lista = [...sucursales.values()].sort((a, b) => a.clave.localeCompare(b.clave));
  const conCorte = lista.filter((s) => s.corteDocumentoId !== null);

  return {
    rango,
    corteHasta: rango.hasta,
    sucursales: lista,
    cuentas: [...cuentasGlobales.values()].sort(
      (a, b) =>
        a.institucion.localeCompare(b.institucion) || a.cuenta.localeCompare(b.cuenta),
    ),
    totales: {
      cajaFisica: sumar(lista.map((s) => s.cajaFisica)),
      banco: sumar(lista.map((s) => s.banco)),
      transito: sumar(lista.map((s) => s.transito)),
      otro: sumar(lista.map((s) => s.otro)),
      total: sumar(lista.map((s) => s.total)),
    },
    sucursalesSinCorte: lista.filter((s) => s.corteDocumentoId === null).map((s) => s.clave),
    fechasDeCorte: [...new Set(conCorte.map((s) => s.fechaCorte).filter((f): f is string => !!f))].sort(),
  };
}

export type FichaSocio = PosicionSocio & {
  
  socioId: number;
  nombre: string;
  
  retiradoEnPeriodo: string;
  valesEnPeriodo: number;
};

export type RepartoFormal = {
  id: number;
  ejercicio: string;
  fechaBalance: string;
  utilidadRepartible: string;
  actaReferencia: string;
};

export type ReporteUtilidadesSocios = {
  rango: RangoReporte;
  socios: FichaSocio[];
  repartos: RepartoFormal[];
  totalAnticipos: string;
  totalRepartido: string;
  totalPorComprobar: string;
  sociosConSaldo: number;
  
  saldoEsAcumuladoHistorico: true;
};

export async function utilidadesPendientesReparto(
  entrada: EntradaRangoReporte,
): Promise<ReporteUtilidadesSocios> {
  const rango = esquemaRangoReporte.parse(entrada);

  const [{ rows: filasSocio }, { rows: filasPeriodo }, { rows: filasReparto }] = await Promise.all([
    query<{
      socio_persona_id: string | number;
      socio_nombre: string;
      total_anticipos: string;
      total_repartido: string;
    }>(
      `SELECT a.socio_persona_id,
              a.socio_nombre,
              a.total_anticipos::text,
              a.total_repartido::text
         FROM traza.v_anticipo_utilidades_socio a
        ORDER BY a.socio_nombre`,
    ),
    query<{ socio_persona_id: string | number; importe: string; vales: string | number }>(
      `SELECT v.socio_persona_id,
              sum(v.importe)::text AS importe,
              count(*) AS vales
         FROM traza.vale_egreso_rci05 v
         JOIN traza.v_documento_financiero d ON d.id = v.documento_id
        WHERE v.concepto_codigo = 'RETIRO_UTILIDADES_SOCIO'
          AND d.estado = 'FIRMADO'
          AND v.fecha_hora::date BETWEEN $1::date AND $2::date
          AND ($3::bigint IS NULL OR d.sucursal_id = $3::bigint)
        GROUP BY v.socio_persona_id`,
      [rango.desde, rango.hasta, rango.sucursalId],
    ),
    query<{
      id: string | number;
      ejercicio: string;
      fecha_balance: string;
      utilidad_repartible: string;
      acta_referencia: string;
    }>(
      `SELECT r.id,
              r.ejercicio,
              r.fecha_balance::text,
              r.utilidad_repartible::text,
              r.acta_referencia
         FROM traza.reparto_utilidades r
        ORDER BY r.fecha_balance DESC`,
    ),
  ]);

  const enPeriodo = new Map(
    filasPeriodo.map((fila) => [
      aNumero(fila.socio_persona_id),
      { importe: aImporte(fila.importe), vales: aNumero(fila.vales) },
    ]),
  );

  const socios: FichaSocio[] = filasSocio.map((fila) => {
    const socioId = aNumero(fila.socio_persona_id);
    const posicion = posicionSocio({
      totalAnticipos: fila.total_anticipos,
      totalRepartido: fila.total_repartido,
    });
    if (!posicion) {
      
      throw new Error(`No se pudo calcular la posición del socio ${fila.socio_nombre}`);
    }
    const periodo = enPeriodo.get(socioId);
    return {
      ...posicion,
      socioId,
      nombre: fila.socio_nombre,
      retiradoEnPeriodo: periodo?.importe ?? CERO,
      valesEnPeriodo: periodo?.vales ?? 0,
    };
  });

  return {
    rango,
    socios,
    repartos: filasReparto.map((fila) => ({
      id: aNumero(fila.id),
      ejercicio: fila.ejercicio,
      fechaBalance: fila.fecha_balance,
      utilidadRepartible: fila.utilidad_repartible,
      actaReferencia: fila.acta_referencia,
    })),
    totalAnticipos: sumar(socios.map((s) => s.totalAnticipos)),
    totalRepartido: sumar(socios.map((s) => s.totalRepartido)),
    totalPorComprobar: sumar(socios.map((s) => s.saldoPorComprobar)),
    sociosConSaldo: socios.filter((s) => s.tieneSaldoPorComprobar).length,
    saldoEsAcumuladoHistorico: true,
  };
}

export const CLAVES_REPORTE = [
  "ingresos",
  "egresos",
  "diferencias",
  "posicion",
  "socios",
] as const;

export type ClaveReporte = (typeof CLAVES_REPORTE)[number];

export const ETIQUETA_REPORTE: Record<ClaveReporte, string> = {
  ingresos: "Ingresos por tipo",
  egresos: "Egresos por tipo",
  diferencias: "Diferencias de caja",
  posicion: "Posición de efectivo",
  socios: "Utilidades por repartir",
};

export type PanelReportes = {
  rango: RangoReporte;
  ingresos: ReporteIngresos;
  egresos: ReporteEgresos;
  diferencias: ReporteDiferencias;
  posicion: ReportePosicionEfectivo;
  socios: ReporteUtilidadesSocios;
};

export async function panelDeReportes(entrada: EntradaRangoReporte): Promise<PanelReportes> {
  const rango = esquemaRangoReporte.parse(entrada);

  const [ingresos, egresos, diferencias, posicion, socios] = await Promise.all([
    ingresosPorTipo(rango),
    egresosPorTipo(rango),
    historialDiferencias(rango),
    posicionEfectivo(rango),
    utilidadesPendientesReparto(rango),
  ]);

  return { rango, ingresos, egresos, diferencias, posicion, socios };
}

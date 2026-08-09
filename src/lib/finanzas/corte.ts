import "server-only";

import type { PoolClient } from "pg";
import { z } from "zod";

import { query, withTransaction } from "@/lib/db";
import {
  MINIMO_EXPLICACION_DIFERENCIA,
  aCentavos,
  arqueoCorte,
  deCentavos,
  type ArqueoCorte,
} from "@/lib/finanzas/calculos";
import {
  ETIQUETA_ESTADO_DOCUMENTO,
  ETIQUETA_TIPO_RCI,
  esquemaFechaIso,
  esquemaId,
  esquemaImporteMonetario,
  esquemaImporteNoNegativo,
  type EstadoDocumentoFinanciero,
  type TipoRci,
} from "@/lib/finanzas/tipos";

function aNumero(valor: string | number): number {
  return typeof valor === "number" ? valor : Number(valor);
}

function aIso(valor: Date | string): string {
  return (valor instanceof Date ? valor : new Date(valor)).toISOString();
}

function aIsoOpcional(valor: Date | string | null | undefined): string | null {
  return valor === null || valor === undefined ? null : aIso(valor);
}

function sumarImportes(importes: string[]): bigint {
  return importes.reduce((total, importe) => total + (aCentavos(importe) ?? 0n), 0n);
}

export type NaturalezaMovimiento = "INGRESO" | "EGRESO";

const ORDEN_CONCEPTO_GRUPO = [
  "VENTAS_CONTADO",
  "UTILIDAD_CONSIGNA",
  "SERVICIO",
  "OTROS_INGRESOS",
  "NOMINA_Y_COMISIONES",
  "RETIRO_SOCIOS",
  "PROVEEDORES_Y_GASTOS",
] as const;

const ETIQUETA_CONCEPTO_GRUPO: Record<string, string> = {
  VENTAS_CONTADO: "Ventas de contado (RCI-01)",
  UTILIDAD_CONSIGNA: "Utilidad de consignas (RCI-03)",
  SERVICIO: "Ingresos por servicio (RCI-04)",
  OTROS_INGRESOS: "Otros ingresos (sin folio)",
  NOMINA_Y_COMISIONES: "Nómina y comisiones (vale RCI-05)",
  RETIRO_SOCIOS: "Retiros de socios (vale RCI-05)",
  PROVEEDORES_Y_GASTOS: "Proveedores y gastos (vale RCI-05)",
};

function etiquetaGrupo(conceptoGrupo: string): string {
  return ETIQUETA_CONCEPTO_GRUPO[conceptoGrupo] ?? conceptoGrupo;
}

function ordenGrupo(conceptoGrupo: string): number {
  const posicion = ORDEN_CONCEPTO_GRUPO.indexOf(
    conceptoGrupo as (typeof ORDEN_CONCEPTO_GRUPO)[number],
  );
  return posicion === -1 ? ORDEN_CONCEPTO_GRUPO.length : posicion;
}

export const TIPOS_RESGUARDO = ["TRANSITO", "OTRO"] as const;
export type TipoResguardo = (typeof TIPOS_RESGUARDO)[number];

export type UbicacionCodigo = "CAJA_FISICA" | "BANCO" | TipoResguardo;

const ETIQUETA_UBICACION: Record<string, string> = {
  CAJA_FISICA: "En caja — efectivo contado",
  BANCO: "Depositado en banco",
  TRANSITO: "En tránsito / por depositar",
  OTRO: "Otro resguardo",
};

const esquemaTurno = z
  .string()
  .trim()
  .max(40)
  .nullish()
  .transform((valor) => valor ?? "");

export const TURNOS_CORTE = [
  { valor: "", etiqueta: "Sin turno — día completo" },
  { valor: "MATUTINO", etiqueta: "Matutino" },
  { valor: "VESPERTINO", etiqueta: "Vespertino" },
  { valor: "NOCTURNO", etiqueta: "Nocturno" },
] as const;

export function etiquetaTurno(turno: string): string {
  return TURNOS_CORTE.find((t) => t.valor === turno)?.etiqueta ?? turno;
}

export const esquemaAbrirCorte = z.object({
  sucursalId: esquemaId,
  
  fecha: esquemaFechaIso,
  turno: esquemaTurno,
  
  custodioUsuarioId: esquemaId,
});

export type EntradaAbrirCorte = z.input<typeof esquemaAbrirCorte>;

export const esquemaDepositoCorte = z.object({
  institucion: z
    .string()
    .trim()
    .min(2, "Indica la institución bancaria del depósito")
    .max(80),
  cuenta: z
    .string()
    .trim()
    .min(4, "Captura la cuenta a la que se depositó")
    .max(40),
  monto: esquemaImporteMonetario,
  fechaDeposito: esquemaFechaIso,
  
  comprobanteRef: z
    .string()
    .trim()
    .min(3, "Captura la referencia del comprobante del depósito")
    .max(60),
});

export type EntradaDepositoCorte = z.input<typeof esquemaDepositoCorte>;

export const esquemaResguardoCorte = z.object({
  tipo: z.enum(TIPOS_RESGUARDO),
  monto: esquemaImporteMonetario,
  detalle: z
    .string()
    .trim()
    .min(5, "Explica dónde está ese efectivo y bajo responsabilidad de quién")
    .max(500),
});

export type EntradaResguardoCorte = z.input<typeof esquemaResguardoCorte>;

export const esquemaOtroIngresoCorte = z.object({
  concepto: z
    .string()
    .trim()
    .min(10, "Explica de dónde salió ese dinero; sin folio, es lo único que lo respalda")
    .max(300),
  importe: esquemaImporteMonetario,
});

export type EntradaOtroIngresoCorte = z.input<typeof esquemaOtroIngresoCorte>;

export const esquemaCerrarCorte = z.object({
  
  efectivoContado: esquemaImporteNoNegativo,
  
  explicacion: z
    .string()
    .trim()
    .max(1000)
    .nullish()
    .transform((valor) => (valor ? valor : null)),
});

export type EntradaCerrarCorte = z.input<typeof esquemaCerrarCorte>;

export type CorteCaja = {
  documentoId: number;
  folio: string;
  folioCompleto: string;
  estado: EstadoDocumentoFinanciero | null;
  sucursalId: number;
  sucursalClave: string;
  
  fechaCorte: string;
  
  turno: string;
  custodioUsuarioId: number;
  custodioNombre: string;
  
  saldoInicial: string;
  totalIngresos: string;
  
  totalEgresos: string;
  
  saldoCalculado: string;
  
  efectivoContado: string | null;
  
  diferencia: string | null;
  explicacionDiferencia: string | null;
  
  armadoEn: string | null;
};

export type FolioDelCorte = {
  id: number;
  origenDocumentoId: number | null;
  folio: string | null;
  folioCompleto: string | null;
  tipoCodigo: TipoRci | null;
  tipoEtiqueta: string | null;
  naturaleza: NaturalezaMovimiento;
  conceptoGrupo: string;
  
  concepto: string | null;
  capturadoPorNombre: string | null;
  importe: string;
};

export type GrupoDelCorte = {
  conceptoGrupo: string;
  etiqueta: string;
  naturaleza: NaturalezaMovimiento;
  subtotal: string;
  folios: FolioDelCorte[];
};

export type DetalleCorte = {
  documentoId: number;
  grupos: GrupoDelCorte[];
  totalIngresos: string;
  
  totalEgresosFolios: string;
  totalDepositos: string;
  totalResguardos: string;
  
  totalEgresos: string;
};

export type CorteConDetalle = {
  corte: CorteCaja;
  detalle: DetalleCorte;
};

export type DepositoCorte = {
  id: number;
  corteDocumentoId: number;
  institucion: string;
  cuenta: string;
  monto: string;
  fechaDeposito: string;
  comprobanteRef: string;
  registradoPor: number;
  registradoEn: string;
};

export type ResguardoCorte = {
  id: number;
  corteDocumentoId: number;
  tipo: TipoResguardo;
  monto: string;
  detalle: string;
};

export type UbicacionEfectivo = {
  documentoId: number;
  ubicacion: UbicacionCodigo;
  etiqueta: string;
  institucion: string | null;
  cuenta: string | null;
  
  fecha: string | null;
  monto: string;
  detalle: string | null;
};

export type FolioSinFirmar = {
  folio: string;
  tipoCodigo: TipoRci;
  tipoEtiqueta: string;
  estado: EstadoDocumentoFinanciero;
  estadoEtiqueta: string;
};

export type PrevisualizacionArqueo = ArqueoCorte & {
  documentoId: number;
  saldoInicial: string;
  totalIngresos: string;
  totalEgresos: string;
  
  armadoEn: string | null;
  
  minimoCaracteresExplicacion: number;
  foliosSinFirmar: FolioSinFirmar[];
  
  bloqueadoPorFoliosSinFirmar: boolean;
};

type FilaCorte = {
  documento_id: string | number;
  folio: string;
  folio_completo: string;
  estado: string | null;
  sucursal_id: string | number;
  sucursal_clave: string;
  fecha_corte: string;
  turno: string;
  custodio_usuario_id: string | number;
  custodio_nombre: string;
  saldo_inicial: string;
  total_ingresos: string;
  total_egresos: string;
  saldo_calculado: string;
  efectivo_contado: string | null;
  diferencia: string | null;
  explicacion_diferencia: string | null;
  armado_en: Date | string | null;
};

const SELECT_CORTE = `
  SELECT c.documento_id,
         d.folio,
         d.folio_completo,
         d.estado,
         c.sucursal_id,
         d.sucursal_clave,
         c.fecha_corte::text        AS fecha_corte,
         c.turno,
         c.custodio_usuario_id,
         u.nombre                   AS custodio_nombre,
         c.saldo_inicial::text      AS saldo_inicial,
         c.total_ingresos::text     AS total_ingresos,
         c.total_egresos::text      AS total_egresos,
         c.saldo_calculado::text    AS saldo_calculado,
         c.efectivo_contado::text   AS efectivo_contado,
         c.diferencia::text         AS diferencia,
         c.explicacion_diferencia,
         c.armado_en
    FROM traza.corte_caja_rci07 c
    JOIN traza.v_documento_financiero d ON d.id = c.documento_id
    JOIN traza.usuario u ON u.id = c.custodio_usuario_id`;

function filaACorte(fila: FilaCorte): CorteCaja {
  return {
    documentoId: aNumero(fila.documento_id),
    folio: fila.folio,
    folioCompleto: fila.folio_completo,
    estado: fila.estado as EstadoDocumentoFinanciero | null,
    sucursalId: aNumero(fila.sucursal_id),
    sucursalClave: fila.sucursal_clave,
    fechaCorte: fila.fecha_corte,
    turno: fila.turno,
    custodioUsuarioId: aNumero(fila.custodio_usuario_id),
    custodioNombre: fila.custodio_nombre,
    saldoInicial: fila.saldo_inicial,
    totalIngresos: fila.total_ingresos,
    totalEgresos: fila.total_egresos,
    saldoCalculado: fila.saldo_calculado,
    efectivoContado: fila.efectivo_contado,
    diferencia: fila.diferencia,
    explicacionDiferencia: fila.explicacion_diferencia,
    armadoEn: aIsoOpcional(fila.armado_en),
  };
}

async function leerCorte(cliente: PoolClient, documentoId: number): Promise<CorteCaja | null> {
  const { rows } = await cliente.query<FilaCorte>(
    `${SELECT_CORTE} WHERE c.documento_id = $1`,
    [documentoId],
  );
  return rows[0] ? filaACorte(rows[0]) : null;
}

export async function obtenerCorte(corteId: number): Promise<CorteCaja | null> {
  const id = esquemaId.parse(corteId);
  const { rows } = await query<FilaCorte>(`${SELECT_CORTE} WHERE c.documento_id = $1`, [id]);
  return rows[0] ? filaACorte(rows[0]) : null;
}

export async function corteDelDia(
  sucursalId: number,
  fecha: string,
  turno?: string | null,
): Promise<CorteCaja | null> {
  const sucursal = esquemaId.parse(sucursalId);
  const dia = esquemaFechaIso.parse(fecha);
  const turnoNormalizado = esquemaTurno.parse(turno);

  const { rows } = await query<FilaCorte>(
    `${SELECT_CORTE}
      WHERE c.sucursal_id = $1
        AND c.fecha_corte = $2::date
        AND c.turno = $3`,
    [sucursal, dia, turnoNormalizado],
  );
  return rows[0] ? filaACorte(rows[0]) : null;
}

export async function abrirCorte(
  entrada: EntradaAbrirCorte,
  usuario: number,
): Promise<CorteCaja> {
  const datos = esquemaAbrirCorte.parse(entrada);
  const usuarioId = esquemaId.parse(usuario);

  return withTransaction(async (cliente) => {
    const emitido = await cliente.query<{ id: string | number }>(
      `SELECT d.id FROM traza.emitir_folio_financiero('CACM-RCI-07', $1, $2) AS d`,
      [datos.sucursalId, usuarioId],
    );
    const documentoId = aNumero(emitido.rows[0].id);

    await cliente.query(
      `INSERT INTO traza.corte_caja_rci07
         (documento_id, sucursal_id, fecha_corte, turno, custodio_usuario_id)
       VALUES ($1, $2, $3::date, $4, $5)`,
      [documentoId, datos.sucursalId, datos.fecha, datos.turno, datos.custodioUsuarioId],
    );

    const corte = await leerCorte(cliente, documentoId);
    if (!corte) {
      
      throw new Error("El corte de caja no quedó disponible después de crearlo");
    }
    return corte;
  });
}

async function rearmar(
  cliente: PoolClient,
  documentoId: number,
  usuarioId: number,
): Promise<void> {
  await cliente.query(`SELECT traza.armar_corte_caja($1, $2)`, [documentoId, usuarioId]);
}

type FilaDeposito = {
  id: string | number;
  corte_documento_id: string | number;
  institucion: string;
  cuenta: string;
  monto: string;
  fecha_deposito: string;
  comprobante_ref: string;
  registrado_por: string | number;
  registrado_en: Date | string;
};

function filaADeposito(fila: FilaDeposito): DepositoCorte {
  return {
    id: aNumero(fila.id),
    corteDocumentoId: aNumero(fila.corte_documento_id),
    institucion: fila.institucion,
    cuenta: fila.cuenta,
    monto: fila.monto,
    fechaDeposito: fila.fecha_deposito,
    comprobanteRef: fila.comprobante_ref,
    registradoPor: aNumero(fila.registrado_por),
    registradoEn: aIso(fila.registrado_en),
  };
}

export async function registrarDeposito(
  corteId: number,
  datos: EntradaDepositoCorte,
  usuario: number,
): Promise<DepositoCorte> {
  const id = esquemaId.parse(corteId);
  const usuarioId = esquemaId.parse(usuario);
  const deposito = esquemaDepositoCorte.parse(datos);

  return withTransaction(async (cliente) => {
    const { rows } = await cliente.query<FilaDeposito>(
      `INSERT INTO traza.deposito_corte_rci07
         (corte_documento_id, institucion, cuenta, monto, fecha_deposito,
          comprobante_ref, registrado_por)
       VALUES ($1, $2, $3, $4::numeric, $5::date, $6, $7)
       RETURNING id, corte_documento_id, institucion, cuenta, monto::text AS monto,
                 fecha_deposito::text AS fecha_deposito, comprobante_ref,
                 registrado_por, registrado_en`,
      [
        id,
        deposito.institucion,
        deposito.cuenta,
        deposito.monto,
        deposito.fechaDeposito,
        deposito.comprobanteRef,
        usuarioId,
      ],
    );

    await rearmar(cliente, id, usuarioId);
    return filaADeposito(rows[0]);
  });
}

type FilaResguardo = {
  id: string | number;
  corte_documento_id: string | number;
  tipo: string;
  monto: string;
  detalle: string;
};

function filaAResguardo(fila: FilaResguardo): ResguardoCorte {
  return {
    id: aNumero(fila.id),
    corteDocumentoId: aNumero(fila.corte_documento_id),
    tipo: fila.tipo as TipoResguardo,
    monto: fila.monto,
    detalle: fila.detalle,
  };
}

export async function registrarResguardo(
  corteId: number,
  datos: EntradaResguardoCorte,
  usuario: number,
): Promise<ResguardoCorte> {
  const id = esquemaId.parse(corteId);
  const usuarioId = esquemaId.parse(usuario);
  const resguardo = esquemaResguardoCorte.parse(datos);

  return withTransaction(async (cliente) => {
    const { rows } = await cliente.query<FilaResguardo>(
      `INSERT INTO traza.resguardo_corte_rci07 (corte_documento_id, tipo, monto, detalle)
       VALUES ($1, $2, $3::numeric, $4)
       RETURNING id, corte_documento_id, tipo, monto::text AS monto, detalle`,
      [id, resguardo.tipo, resguardo.monto, resguardo.detalle],
    );

    await rearmar(cliente, id, usuarioId);
    return filaAResguardo(rows[0]);
  });
}

type FilaDetalle = {
  id: string | number;
  origen_documento_id: string | number | null;
  folio: string | null;
  folio_completo: string | null;
  tipo_codigo: string | null;
  naturaleza: string;
  concepto_grupo: string;
  concepto: string | null;
  capturado_por_nombre: string | null;
  importe: string;
};

const SELECT_DETALLE_CORTE = `
  SELECT dc.id,
         dc.origen_documento_id,
         d.folio,
         d.folio_completo,
         d.tipo_codigo,
         dc.naturaleza,
         dc.concepto_grupo,
         dc.concepto,
         u.nombre AS capturado_por_nombre,
         dc.importe::text AS importe
    FROM traza.corte_caja_detalle dc
    LEFT JOIN traza.v_documento_financiero d ON d.id = dc.origen_documento_id
    LEFT JOIN traza.usuario u ON u.id = dc.capturado_por
   WHERE dc.corte_documento_id = $1
   ORDER BY dc.concepto_grupo, d.tipo_codigo NULLS LAST, d.consecutivo NULLS LAST, dc.id`;

const SELECT_TOTALES_FUERA_DE_CAJA = `
  SELECT 'DEPOSITO' AS clase, COALESCE(sum(monto), 0)::text AS total
    FROM traza.deposito_corte_rci07 WHERE corte_documento_id = $1
   UNION ALL
  SELECT 'RESGUARDO', COALESCE(sum(monto), 0)::text
    FROM traza.resguardo_corte_rci07 WHERE corte_documento_id = $1`;

async function leerDetalle(cliente: PoolClient, documentoId: number): Promise<DetalleCorte> {
  const [detalle, fueraDeCaja] = await Promise.all([
    cliente.query<FilaDetalle>(SELECT_DETALLE_CORTE, [documentoId]),
    cliente.query<{ clase: string; total: string }>(SELECT_TOTALES_FUERA_DE_CAJA, [documentoId]),
  ]);

  const porGrupo = new Map<string, GrupoDelCorte>();
  for (const fila of detalle.rows) {
    const folio: FolioDelCorte = {
      id: aNumero(fila.id),
      origenDocumentoId:
        fila.origen_documento_id === null ? null : aNumero(fila.origen_documento_id),
      folio: fila.folio,
      folioCompleto: fila.folio_completo,
      tipoCodigo: fila.tipo_codigo === null ? null : (fila.tipo_codigo as TipoRci),
      tipoEtiqueta:
        fila.tipo_codigo === null
          ? null
          : (ETIQUETA_TIPO_RCI[fila.tipo_codigo as TipoRci] ?? fila.tipo_codigo),
      naturaleza: fila.naturaleza as NaturalezaMovimiento,
      conceptoGrupo: fila.concepto_grupo,
      concepto: fila.concepto,
      capturadoPorNombre: fila.capturado_por_nombre,
      importe: fila.importe,
    };

    const grupo = porGrupo.get(folio.conceptoGrupo) ?? {
      conceptoGrupo: folio.conceptoGrupo,
      etiqueta: etiquetaGrupo(folio.conceptoGrupo),
      naturaleza: folio.naturaleza,
      subtotal: "0.00",
      folios: [],
    };
    grupo.folios.push(folio);
    porGrupo.set(folio.conceptoGrupo, grupo);
  }

  const grupos = [...porGrupo.values()]
    .map((grupo) => ({
      ...grupo,
      subtotal: deCentavos(sumarImportes(grupo.folios.map((folio) => folio.importe))),
    }))
    .sort((a, b) => ordenGrupo(a.conceptoGrupo) - ordenGrupo(b.conceptoGrupo));

  const ingresos = sumarImportes(
    grupos.filter((g) => g.naturaleza === "INGRESO").map((g) => g.subtotal),
  );
  const egresosFolios = sumarImportes(
    grupos.filter((g) => g.naturaleza === "EGRESO").map((g) => g.subtotal),
  );

  const totalPorClase = (clase: string): bigint =>
    aCentavos(fueraDeCaja.rows.find((fila) => fila.clase === clase)?.total ?? "0") ?? 0n;
  const depositos = totalPorClase("DEPOSITO");
  const resguardos = totalPorClase("RESGUARDO");

  return {
    documentoId,
    grupos,
    totalIngresos: deCentavos(ingresos),
    totalEgresosFolios: deCentavos(egresosFolios),
    totalDepositos: deCentavos(depositos),
    totalResguardos: deCentavos(resguardos),
    totalEgresos: deCentavos(egresosFolios + depositos + resguardos),
  };
}

export async function detalleCorte(corteId: number): Promise<DetalleCorte> {
  const id = esquemaId.parse(corteId);
  return withTransaction((cliente) => leerDetalle(cliente, id));
}

export async function armarCorte(corteId: number, usuario: number): Promise<CorteConDetalle> {
  const id = esquemaId.parse(corteId);
  const usuarioId = esquemaId.parse(usuario);

  return withTransaction(async (cliente) => {
    await rearmar(cliente, id, usuarioId);

    const [corte, detalle] = await Promise.all([
      leerCorte(cliente, id),
      leerDetalle(cliente, id),
    ]);
    if (!corte) {

      throw new Error("El corte de caja no existe");
    }
    return { corte, detalle };
  });
}

export async function agregarOtroIngreso(
  corteId: number,
  datos: EntradaOtroIngresoCorte,
  usuario: number,
): Promise<CorteConDetalle> {
  const id = esquemaId.parse(corteId);
  const usuarioId = esquemaId.parse(usuario);
  const ingreso = esquemaOtroIngresoCorte.parse(datos);

  return withTransaction(async (cliente) => {
    await cliente.query(`SELECT traza.agregar_otro_ingreso_corte($1, $2, $3::numeric, $4)`, [
      id,
      ingreso.concepto,
      ingreso.importe,
      usuarioId,
    ]);

    const [corte, detalle] = await Promise.all([leerCorte(cliente, id), leerDetalle(cliente, id)]);
    if (!corte) {
      
      throw new Error("El corte de caja no existe");
    }
    return { corte, detalle };
  });
}

export async function cerrarCorte(
  corteId: number,
  datos: EntradaCerrarCorte,
  usuario: number,
): Promise<CorteCaja> {
  const id = esquemaId.parse(corteId);
  const usuarioId = esquemaId.parse(usuario);
  const cierre = esquemaCerrarCorte.parse(datos);

  return withTransaction(async (cliente) => {
    await cliente.query(`SELECT traza.cerrar_corte_caja($1, $2::numeric, $3, $4)`, [
      id,
      cierre.efectivoContado,
      usuarioId,
      cierre.explicacion,
    ]);

    const corte = await leerCorte(cliente, id);
    if (!corte) {
      
      throw new Error("El corte de caja no existe");
    }
    return corte;
  });
}

type FilaUbicacion = {
  documento_id: string | number;
  ubicacion: string;
  institucion: string | null;
  cuenta: string | null;
  fecha: string | null;
  monto: string;
  detalle: string | null;
};

export async function ubicacionEfectivo(corteId: number): Promise<UbicacionEfectivo[]> {
  const id = esquemaId.parse(corteId);

  const { rows } = await query<FilaUbicacion>(
    `SELECT u.documento_id,
            u.ubicacion,
            u.institucion,
            u.cuenta,
            u.fecha::text AS fecha,
            u.monto::text AS monto,
            u.detalle
       FROM traza.v_corte_ubicacion_efectivo u
      WHERE u.documento_id = $1
      ORDER BY CASE u.ubicacion
                 WHEN 'CAJA_FISICA' THEN 1
                 WHEN 'BANCO'       THEN 2
                 WHEN 'TRANSITO'    THEN 3
                 ELSE 4
               END,
               u.monto DESC`,
    [id],
  );

  return rows.map((fila) => ({
    documentoId: aNumero(fila.documento_id),
    ubicacion: fila.ubicacion as UbicacionCodigo,
    etiqueta: ETIQUETA_UBICACION[fila.ubicacion] ?? fila.ubicacion,
    institucion: fila.institucion,
    cuenta: fila.cuenta,
    fecha: fila.fecha,
    monto: fila.monto,
    detalle: fila.detalle,
  }));
}

export async function foliosPendientesDelDia(
  sucursalId: number,
  fecha: string,
): Promise<FolioSinFirmar[]> {
  const sucursal = esquemaId.parse(sucursalId);
  const dia = esquemaFechaIso.parse(fecha);

  const { rows } = await query<{ folio: string; tipo_codigo: string; estado: string }>(
    `SELECT f.folio, f.tipo_codigo, f.estado
       FROM traza.folios_sin_firmar_del_dia($1, $2::date) f`,
    [sucursal, dia],
  );

  return rows.map((fila) => ({
    folio: fila.folio,
    tipoCodigo: fila.tipo_codigo as TipoRci,
    tipoEtiqueta: ETIQUETA_TIPO_RCI[fila.tipo_codigo as TipoRci] ?? fila.tipo_codigo,
    estado: fila.estado as EstadoDocumentoFinanciero,
    estadoEtiqueta:
      ETIQUETA_ESTADO_DOCUMENTO[fila.estado as EstadoDocumentoFinanciero] ?? fila.estado,
  }));
}

export async function previsualizarArqueo(
  corteId: number,
  efectivoContado: string,
): Promise<PrevisualizacionArqueo | null> {
  const id = esquemaId.parse(corteId);
  const contado = esquemaImporteNoNegativo.parse(efectivoContado);

  const corte = await obtenerCorte(id);
  if (!corte) return null;

  const arqueo = arqueoCorte({
    saldoInicial: corte.saldoInicial,
    totalIngresos: corte.totalIngresos,
    totalEgresos: corte.totalEgresos,
    efectivoContado: contado,
  });
  if (!arqueo) {

    throw new Error("No se pudo calcular el arqueo con los importes del corte");
  }

  const foliosSinFirmar = await foliosPendientesDelDia(corte.sucursalId, corte.fechaCorte);

  return {
    ...arqueo,
    documentoId: corte.documentoId,
    saldoInicial: corte.saldoInicial,
    totalIngresos: corte.totalIngresos,
    totalEgresos: corte.totalEgresos,
    armadoEn: corte.armadoEn,
    minimoCaracteresExplicacion: MINIMO_EXPLICACION_DIFERENCIA,
    foliosSinFirmar,
    bloqueadoPorFoliosSinFirmar: foliosSinFirmar.length > 0,
  };
}

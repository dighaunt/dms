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

/**
 * CACM-RCI-07 — Corte de caja diario.
 *
 * EL CORTE JALA, NO RECAPTURA. Los ingresos y los egresos del día no se
 * teclean: se leen de los folios FIRMADOS de esa sucursal y esa fecha
 * (RCI-01 de contado, utilidad de RCI-03, RCI-04 en efectivo y vales RCI-05
 * pagados en efectivo). Quien decide qué entra es `armar_corte_caja`, que
 * además guarda el snapshot en `corte_caja_detalle` para poder reconstruir el
 * corte años después aunque la consulta cambie. Este módulo NO reproduce esa
 * consulta: la invoca.
 *
 * EL ÚNICO IMPORTE QUE TECLEA EL CUSTODIO ES EL EFECTIVO FÍSICO CONTADO. Todo
 * lo demás —saldo inicial encadenado al corte anterior, totales, saldo
 * calculado y diferencia— lo produce la base: `saldo_inicial_corte` encadena el
 * saldo con el último corte firmado y `saldo_calculado` y `diferencia` son
 * columnas GENERATED. Un campo de captura para cualquiera de esas cifras
 * convertiría el arqueo en una declaración y dejaría de ser una comprobación.
 *
 * Los otros dos datos que sí se declaran —depósitos bancarios y resguardos—
 * tampoco son importes del arqueo: son efectivo que ya salió del cajón, y por
 * eso `armar_corte_caja` los suma a los egresos.
 *
 * Los candados viven en plpgsql (migración 037) y aquí sólo se invocan: que no
 * queden folios del día sin firmar, que una diferencia se explique, que un
 * corte cerrado ya no admita cambios. Cuando uno se dispara llega como P0001 y
 * debe propagarse tal cual; `respuestaError` de "@/lib/api" lo convierte en un
 * 409 con el mensaje que quien está contando el dinero necesita leer. No se
 * atrapa ni se reescribe nada de eso.
 */

// ===== HELPERS DE MAPEO =====

/** El driver entrega los bigint como cadena; aquí son número. */
function aNumero(valor: string | number): number {
  return typeof valor === "number" ? valor : Number(valor);
}

function aIso(valor: Date | string): string {
  return (valor instanceof Date ? valor : new Date(valor)).toISOString();
}

function aIsoOpcional(valor: Date | string | null | undefined): string | null {
  return valor === null || valor === undefined ? null : aIso(valor);
}

/** Suma importes ya canónicos en centavos enteros; nunca en punto flotante. */
function sumarImportes(importes: string[]): bigint {
  return importes.reduce((total, importe) => total + (aCentavos(importe) ?? 0n), 0n);
}

// ===== VOCABULARIO DEL CORTE =====

export type NaturalezaMovimiento = "INGRESO" | "EGRESO";

/**
 * Grupos con los que `armar_corte_caja` clasifica cada folio, en el orden en
 * que el papel los imprime: primero la Parte I (lo que entró) y después la
 * Parte II (lo que salió).
 *
 * `concepto_grupo` es texto libre en la tabla, así que este arreglo ordena y
 * etiqueta lo que hoy existe sin cerrarle la puerta a un grupo nuevo: uno que
 * no figure aquí se muestra con su propio código y se ordena al final, en vez
 * de desaparecer de la pantalla.
 */
const ORDEN_CONCEPTO_GRUPO = [
  "VENTAS_CONTADO",
  "UTILIDAD_CONSIGNA",
  "SERVICIO",
  "OTROS_INGRESOS",
  "NOMINA_Y_COMISIONES",
  "RETIRO_SOCIOS",
  "PROVEEDORES_Y_GASTOS",
] as const;

/**
 * La nómina aparece citada como egreso del VALE (RCI-05) y no del recibo del
 * trabajador (RCI-06) porque contar ambos duplicaría la salida de efectivo:
 * quien mueve el dinero es el vale. El recibo se rastrea desde el vale.
 */
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

/** Dónde quedó el efectivo al cierre, en el orden de los incisos del papel. */
export type UbicacionCodigo = "CAJA_FISICA" | "BANCO" | TipoResguardo;

const ETIQUETA_UBICACION: Record<string, string> = {
  CAJA_FISICA: "En caja — efectivo contado",
  BANCO: "Depositado en banco",
  TRANSITO: "En tránsito / por depositar",
  OTRO: "Otro resguardo",
};

// ===== ESQUEMAS =====

/**
 * Turno del corte. Va a la UNIQUE (sucursal, fecha, turno), que es lo que
 * impide dos cortes del mismo día.
 *
 * CUIDADO al dejarlo vacío: Postgres considera distintos dos NULL, así que esa
 * UNIQUE no puede por sí sola impedir un segundo corte sin turno de la misma
 * fecha. Por eso la pantalla debe consultar `corteDelDia` y abrir el corte que
 * ya existe en lugar de emitir otro folio.
 */
const esquemaTurno = z
  .string()
  .trim()
  .max(40)
  .nullish()
  .transform((valor) => (valor ? valor : null));

export const esquemaAbrirCorte = z.object({
  sucursalId: esquemaId,
  /** Fecha civil del corte: decide qué folios jala `armar_corte_caja`. */
  fecha: esquemaFechaIso,
  turno: esquemaTurno,
  /** Custodio Financiero que responde por el efectivo de ese turno. */
  custodioUsuarioId: esquemaId,
});

export type EntradaAbrirCorte = z.input<typeof esquemaAbrirCorte>;

/**
 * Depósito bancario del día. Los largos repiten los CHECK de la tabla para
 * poder señalar el campo exacto en el formulario —un 23514 sólo permite decir
 * "revisa los datos"—; la autoridad sigue siendo la base.
 */
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
  /** Ficha, referencia o folio del comprobante: sin él no hay depósito que probar. */
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

/**
 * El renglón "Otros ingresos" de la Parte I del RCI-07.
 *
 * Es el único ingreso del corte que no proviene de un folio, y por eso es el
 * único que hay que teclear. El manual le reserva su renglón, así que negarlo
 * no lo hace desaparecer: lo empuja a declararse como "sobrante" en la Parte
 * III —donde se confunde con un descuadre— o a no declararse. Lo que sí se
 * exige es que quede explicado y con nombre, porque la explicación escrita es
 * todo lo que lo sostiene.
 */
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
  /**
   * El efectivo FÍSICO contado. Admite cero —una caja puede quedar vacía tras
   * depositar todo— pero nunca es negativo.
   */
  efectivoContado: esquemaImporteNoNegativo,
  /**
   * Obligatoria sólo si el arqueo no cuadra, y ese juicio lo hace
   * `cerrar_corte_caja` sobre la diferencia que ella misma calcula. Aquí no se
   * decide: se transporta.
   */
  explicacion: z
    .string()
    .trim()
    .max(1000)
    .nullish()
    .transform((valor) => (valor ? valor : null)),
});

export type EntradaCerrarCorte = z.input<typeof esquemaCerrarCorte>;

// ===== TIPOS DE SALIDA =====

/**
 * Cabecera del corte. Todos los importes son cadena: `numeric(18,2)` admite
 * cifras que un `number` ya redondea mal, y un centavo perdido en el corte es
 * una diferencia de caja que alguien tiene que explicar.
 */
export type CorteCaja = {
  documentoId: number;
  folio: string;
  folioCompleto: string;
  estado: EstadoDocumentoFinanciero | null;
  sucursalId: number;
  sucursalClave: string;
  /** Fecha civil AAAA-MM-DD, tal como está en la columna `date`. */
  fechaCorte: string;
  turno: string | null;
  custodioUsuarioId: number;
  custodioNombre: string;
  /** Efectivo contado en el último corte firmado: encadenado, no capturado. */
  saldoInicial: string;
  totalIngresos: string;
  /** Incluye depósitos y resguardos: ambos son efectivo que salió del cajón. */
  totalEgresos: string;
  /** Columna GENERATED: saldo_inicial + ingresos − egresos. */
  saldoCalculado: string;
  /** Nulo mientras el corte no se cierre: es el único importe que se teclea. */
  efectivoContado: string | null;
  /** Columna GENERATED: contado − calculado. Negativa es faltante. */
  diferencia: string | null;
  explicacionDiferencia: string | null;
  /** Última vez que se rearmó el snapshot. Nulo si nunca se armó. */
  armadoEn: string | null;
};

/** Folio que el corte jaló, con la cita de dónde salió el importe. */
/**
 * Un renglón del corte. Casi siempre proviene de un folio, pero no siempre: el
 * papel reserva un renglón de "Otros ingresos" en la Parte I, y ése lo teclea
 * una persona. Cuando no hay folio, lo que sostiene la cifra es `concepto` y el
 * nombre de quien lo capturó; por eso ambos son obligatorios en la base
 * justamente en ese caso.
 */
export type FolioDelCorte = {
  id: number;
  origenDocumentoId: number | null;
  folio: string | null;
  folioCompleto: string | null;
  tipoCodigo: TipoRci | null;
  tipoEtiqueta: string | null;
  naturaleza: NaturalezaMovimiento;
  conceptoGrupo: string;
  /** Explicación escrita; sólo la llevan los renglones sin folio. */
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
  /**
   * Sólo los folios de egreso. NO cuadra con `totalEgresos` de la cabecera, y
   * es a propósito: `armar_corte_caja` suma además depósitos y resguardos, que
   * no son folios sino efectivo que salió del cajón por otra vía. Los tres
   * sumandos se exponen aparte para que la pantalla pueda mostrar la
   * reconciliación en vez de aparentar un descuadre.
   */
  totalEgresosFolios: string;
  totalDepositos: string;
  totalResguardos: string;
  /** Folios de egreso + depósitos + resguardos: la cifra que usa el corte. */
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
  /** Fecha del depósito; nula en las ubicaciones que no son bancarias. */
  fecha: string | null;
  monto: string;
  detalle: string | null;
};

/** Folio del día que sigue sin firmar y por eso detiene el cierre. */
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
  /** Instante del snapshot sobre el que se calculó esta previsualización. */
  armadoEn: string | null;
  /** Largo mínimo que `cerrar_corte_caja` exigirá a la explicación. */
  minimoCaracteresExplicacion: number;
  foliosSinFirmar: FolioSinFirmar[];
  /** Con folios del día sin firmar el cierre falla, cuadre o no el arqueo. */
  bloqueadoPorFoliosSinFirmar: boolean;
};

// ===== LECTURA DE LA CABECERA =====

type FilaCorte = {
  documento_id: string | number;
  folio: string;
  folio_completo: string;
  estado: string | null;
  sucursal_id: string | number;
  sucursal_clave: string;
  fecha_corte: string;
  turno: string | null;
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

/**
 * Proyección única de la cabecera. `fecha_corte` sale como texto a propósito:
 * el driver convertiría una columna `date` en un `Date` a medianoche local y
 * un corte del día 1 podría leerse como del día anterior según el huso del
 * servidor. La fecha del corte decide qué folios se jalan; no puede correrse.
 */
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

/**
 * El corte ya abierto para esa sucursal, fecha y turno.
 *
 * `IS NOT DISTINCT FROM` y no `=` porque el turno puede ser nulo y en SQL
 * NULL = NULL no es verdadero: sin esto, el corte sin turno del día jamás se
 * encontraría y la pantalla abriría uno nuevo cada vez.
 */
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
        AND c.turno IS NOT DISTINCT FROM $3`,
    [sucursal, dia, turnoNormalizado],
  );
  return rows[0] ? filaACorte(rows[0]) : null;
}

// ===== APERTURA DEL CORTE =====

/**
 * Abre el corte del día: emite el folio RCI-07 y crea su fila.
 *
 * Las dos cosas ocurren en UNA transacción porque un folio consumido siempre
 * tiene que tener su fila: un hueco en el consecutivo no se puede explicar
 * después, y un folio de corte sin corte tampoco. Por eso se llama a
 * `emitir_folio_financiero` aquí dentro en lugar de reusar `emitirFolio`, que
 * abre su propia transacción.
 *
 * No se capturan importes: el saldo inicial lo encadena `armar_corte_caja` con
 * el último corte firmado de la sucursal, y el resto sale de los folios del
 * día. Un segundo corte para la misma sucursal, fecha y turno lo rechaza la
 * UNIQUE de la tabla.
 */
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
      // Inalcanzable: la fila se acaba de insertar en esta misma transacción.
      throw new Error("El corte de caja no quedó disponible después de crearlo");
    }
    return corte;
  });
}

// ===== DEPÓSITOS Y RESGUARDOS =====

/**
 * Rehace el snapshot dentro de la transacción que acaba de tocar el corte.
 *
 * Un depósito o un resguardo son efectivo que salió del cajón, así que cambian
 * los egresos y con ellos el saldo calculado. Si el snapshot no se rehiciera,
 * la pantalla mostraría un saldo que ya no corresponde a lo capturado y el
 * custodio contaría contra una cifra vieja. Rehacerlo mientras el corte es
 * borrador es la conducta que la migración 037 declara deseada.
 */
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

/**
 * Declara un depósito bancario del día.
 *
 * No exige vale de egreso porque no es un pago a un tercero: el dinero sigue
 * siendo de la empresa y sólo cambió de lugar. Lo que sí exige —institución,
 * cuenta y comprobante— es lo que permite ir a buscarlo al estado de cuenta.
 *
 * Sobre un corte ya cerrado el disparador `deposito_corte_rci07_congelado` lo
 * impide y pide regresarlo a borrador; ese P0001 se propaga.
 */
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

/**
 * Declara efectivo que no está en el cajón ni en el banco: en tránsito por
 * depositar (inciso c del papel) u otro resguardo (inciso d).
 *
 * La tabla no guarda quién lo declaró —el papel tampoco tiene esa casilla—;
 * el id de usuario se usa para rearmar el corte a nombre de quien lo movió.
 */
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

// ===== DETALLE: LOS FOLIOS QUE EL CORTE JALÓ =====

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

// LEFT JOIN, no JOIN: desde la migración 039 un renglón puede no tener folio
// —el "Otros ingresos" de la Parte I del papel— y un JOIN interno lo dejaría
// fuera en silencio. La cabecera del corte SÍ lo cuenta, así que el detalle
// mostraría menos de lo que suma el total: un descuadre inventado por la
// consulta, que es la peor clase de descuadre porque no existe en el dinero.
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

/** Un solo viaje para las dos sumas que no son folios. */
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

/**
 * Los folios que el corte jaló, agrupados como los agrupa el papel.
 *
 * Se lee dentro de una transacción porque el snapshot y las sumas de depósitos
 * y resguardos tienen que verse en el mismo instante: si un depósito entrara
 * entre las dos consultas, los totales no cuadrarían con lo mostrado.
 */
export async function detalleCorte(corteId: number): Promise<DetalleCorte> {
  const id = esquemaId.parse(corteId);
  return withTransaction((cliente) => leerDetalle(cliente, id));
}

// ===== ARMADO =====

/**
 * Rehace el corte leyendo los folios FIRMADOS del día y devuelve cómo quedó.
 *
 * `armar_corte_caja` no recibe importes: los calcula y guarda el snapshot. Se
 * puede invocar tantas veces como haga falta mientras el corte sea borrador
 * —cada folio que se firme durante el día cambia el resultado— y devuelve un
 * P0001 en cuanto deja de serlo.
 */
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
      // Inalcanzable: `armar_corte_caja` ya habría levantado "El corte de caja
      // no existe" antes de llegar aquí.
      throw new Error("El corte de caja no existe");
    }
    return { corte, detalle };
  });
}

/**
 * Asienta un ingreso del día que no tiene folio que lo respalde.
 *
 * `agregar_otro_ingreso_corte` rearma el corte al terminar, de modo que los
 * totales de la cabecera incluyen el renglón nuevo sin que la pantalla tenga
 * que pedirlo aparte. A diferencia de los demás renglones, éste NO se vuelve a
 * leer en cada armado —no hay de dónde— y por eso `armar_corte_caja` sólo
 * borra los que provienen de un folio.
 */
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
      // Inalcanzable: la función ya habría fallado si el corte no existiera.
      throw new Error("El corte de caja no existe");
    }
    return { corte, detalle };
  });
}

// ===== CIERRE =====

/**
 * Cierra el día: arqueo, validaciones y paso a firma.
 *
 * El único importe que entra es el efectivo físico contado. `cerrar_corte_caja`
 * rearma el corte antes de compararlo —para que nadie cierre contra un
 * snapshot viejo—, exige que no queden folios del día sin firmar, obliga a
 * explicar cualquier diferencia, levanta la alerta que corresponda (GRAVE si
 * es faltante, aviso si es sobrante) y deja el corte en PENDIENTE_DE_FIRMA.
 * Nada de eso se repite aquí.
 *
 * Devuelve el corte ya cerrado, con su diferencia calculada por la base.
 */
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
      // Inalcanzable: `cerrar_corte_caja` levanta P0001 si el corte no existe.
      throw new Error("El corte de caja no existe");
    }
    return corte;
  });
}

// ===== UBICACIÓN DEL EFECTIVO =====

type FilaUbicacion = {
  documento_id: string | number;
  ubicacion: string;
  institucion: string | null;
  cuenta: string | null;
  fecha: string | null;
  monto: string;
  detalle: string | null;
};

/**
 * Dónde quedó el efectivo al cierre: caja, banco, tránsito y otros resguardos.
 *
 * Es derivada, no capturada —`v_corte_ubicacion_efectivo` la arma con el
 * arqueo, los depósitos y los resguardos—, y se ordena en los incisos del
 * papel para que la pantalla y la forma impresa se lean igual. La fila de caja
 * física sólo aparece cuando el corte ya tiene efectivo contado.
 */
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

// ===== POR QUÉ NO SE PUEDE CERRAR EL DÍA =====

/**
 * Folios del día que siguen sin firmar.
 *
 * Es lo que la pantalla necesita para EXPLICAR el bloqueo: cerrar el corte con
 * folios sin firmar sería rendir cuentas de un dinero que todavía no tiene
 * dueño, así que `cerrar_corte_caja` lo rechaza nombrándolos. Mostrarlos antes
 * convierte ese rechazo en una lista de pendientes accionable.
 */
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

// ===== PREVISUALIZACIÓN DEL ARQUEO =====

/**
 * Muestra la diferencia ANTES de intentar cerrar.
 *
 * El cálculo lo hace `arqueoCorte` con los mismos centavos enteros que usa la
 * base, sobre las cifras del último armado: es un espejo para poder avisar
 * —"vas a necesitar explicar un faltante de X"— sin consumir el intento de
 * cierre. La cifra BUENA es la que produce `cerrar_corte_caja`, que rearma el
 * corte antes de comparar; si entre esta previsualización y el cierre se firma
 * otro folio del día, la diferencia real cambiará. Por eso se devuelve
 * `armadoEn`: dice sobre qué snapshot se calculó.
 *
 * Se devuelven también los folios sin firmar porque son la otra razón por la
 * que el cierre puede fallar, y quien opera necesita ver ambas a la vez.
 */
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
    // Inalcanzable: las cifras vienen de columnas numeric ya canónicas. Si
    // ocurriera es un defecto del código, no una regla de negocio incumplida.
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

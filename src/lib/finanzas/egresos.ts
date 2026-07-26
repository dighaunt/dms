import "server-only";

import type { PoolClient } from "pg";
import { z } from "zod";

import { query, withTransaction } from "@/lib/db";
import {
  aCentavos,
  deCentavos,
  estadoValeEgreso,
  posicionSocio,
  type EstadoValeEgreso,
  type FirmaVale,
  type PosicionSocio,
} from "@/lib/finanzas/calculos";
import {
  CATALOGO_ROL_FIRMANTE,
  esquemaFechaHoraIso,
  esquemaFechaIso,
  esquemaId,
  esquemaIdentificacion,
  esquemaImporteMonetario,
  esquemaImporteNoNegativo,
  esquemaNombrePersona,
  type EstadoDocumentoFinanciero,
  type RolFirmante,
  type TipoRci,
} from "@/lib/finanzas/tipos";

/**
 * Los dos formatos con los que sale dinero de la caja: CACM-RCI-05 (vale de
 * egreso) y CACM-RCI-06 (recibo de pago de nómina), más lo que cuelga de
 * ellos: la posición de anticipos de cada socio, el reparto formal de
 * utilidades y las alertas que el propio esquema levanta.
 *
 * Ningún efectivo sale sin vale, y ningún vale surte efecto sin sus tres
 * firmas —autorizó, entregó, recibió— de tres personas distintas. Ese candado
 * NO se reimplementa aquí: lo impone el índice único parcial
 * (documento_id, usuario_id) de `firma_documento_financiero`, y
 * `estadoFirmasVale` sólo lo anticipa en pantalla.
 *
 * Igual que en el resto del módulo, los candados del manual viven en plpgsql
 * (migraciones 034 a 037) y aquí sólo se invocan. Cuando uno se dispara llega
 * como P0001 con su mensaje en español y debe propagarse tal cual:
 * `respuestaError` de "@/lib/api" lo convierte en un 409 legible. No se atrapa
 * ni se reescribe.
 */

// ===== HELPERS DE MAPEO =====

/** El driver entrega los bigint como cadena; aquí son número. */
function aNumero(valor: string | number): number {
  return typeof valor === "number" ? valor : Number(valor);
}

function aNumeroOpcional(valor: string | number | null | undefined): number | null {
  return valor === null || valor === undefined ? null : aNumero(valor);
}

function aIso(valor: Date | string): string {
  return (valor instanceof Date ? valor : new Date(valor)).toISOString();
}

function aIsoOpcional(valor: Date | string | null | undefined): string | null {
  return valor === null || valor === undefined ? null : aIso(valor);
}

// ===== ESQUEMAS DE APOYO =====

/**
 * Texto que el papel deja en blanco cuando no aplica. La pantalla manda ""
 * para una casilla vacía y eso significa "sin dato", no una cadena vacía que
 * la base tendría que guardar como si fuera un valor.
 */
const textoOpcional = (maximo: number) =>
  z
    .string()
    .trim()
    .max(maximo)
    .nullish()
    .transform((valor) => (valor ? valor : null));

/** Referencia opcional a otro folio o a otra fila. Vacío = no aplica. */
const idOpcional = esquemaId.nullish().transform((valor) => valor ?? null);

/**
 * Código de un catálogo administrable (concepto de egreso, forma de pago).
 * Sus valores NO se enumeran aquí a propósito: el manual encarga al
 * administrador dar de alta conceptos nuevos y una unión cerrada en TypeScript
 * convertiría esa alta en un despliegue. Un código inexistente lo rechaza la
 * llave foránea del catálogo.
 */
const esquemaCodigoCatalogo = z
  .string()
  .transform((valor) => valor.trim().toUpperCase())
  .refine(
    (valor) => /^[A-Z_]{2,40}$/.test(valor),
    "El código de catálogo se escribe con letras mayúsculas y guiones bajos",
  );

/** Concepto genérico del catálogo: obliga a escribir cuál fue. */
const CONCEPTO_OTRO = "OTRO";
/** Conceptos con regla propia en el esquema (CHECK de `vale_egreso_rci05`). */
const CONCEPTO_NOMINA = "PAGO_NOMINA";
const CONCEPTO_RETIRO_SOCIO = "RETIRO_UTILIDADES_SOCIO";

const TIPO_VALE: TipoRci = "CACM-RCI-05";

/**
 * Devuelve a BORRADOR un folio que ya se había enviado a firma.
 *
 * Corregir la captura de un folio pendiente es legítimo —la transición
 * PENDIENTE_DE_FIRMA -> BORRADOR existe justo para "se detecta un error antes
 * de firmar"—, pero no puede pasar en silencio: quien reabre la captura queda
 * asentado en el historial de estado. Ése es el uso del id de usuario en la
 * captura: el papel no tiene casilla para él, el historial sí.
 *
 * Sin esto, editar un vale que ya circula para recabar firmas cambiaría el
 * importe autorizado a espaldas de quien está por firmarlo:
 * `bloquear_detalle_documento_fin` sólo congela lo FIRMADO o CANCELADO.
 */
async function reabrirSiEstabaEnFirma(
  cliente: PoolClient,
  documentoId: number,
  usuarioId: number,
): Promise<void> {
  const { rows } = await cliente.query<{ estado: EstadoDocumentoFinanciero | null }>(
    `SELECT traza.estado_documento_fin($1) AS estado`,
    [documentoId],
  );
  if (rows[0]?.estado !== "PENDIENTE_DE_FIRMA") return;

  await cliente.query(`SELECT traza.cambiar_estado_documento_fin($1, 'BORRADOR', $2)`, [
    documentoId,
    usuarioId,
  ]);
}

// ===== CACM-RCI-05 — VALE DE EGRESO DE CAJA =====

/**
 * Campos en el ORDEN DEL PAPEL: fecha y hora, concepto, folio que ampara el
 * egreso, beneficiario con su identificación, forma de pago e importe.
 */
export const esquemaValeEgreso = z
  .object({
    /**
     * Con huso horario explícito: esa hora decide a qué corte de caja
     * pertenece el egreso, y el corte sólo jala los vales de SU fecha.
     */
    fechaHora: esquemaFechaHoraIso,
    /**
     * Del catálogo `concepto_egreso`. Uno de sus renglones —el retiro de un
     * socio— viene marcado `es_anticipo_utilidades`: ver la nota sobre el
     * artículo 19 de la LGSM más abajo, en la sección de anticipos.
     */
    conceptoCodigo: esquemaCodigoCatalogo,
    conceptoOtro: textoOpcional(160),
    /** Folio financiero que ampara el egreso, cuando existe en el sistema. */
    folioRelacionadoId: idOpcional,
    /** Folio de un comprobante externo (factura del proveedor, por ejemplo). */
    folioRelacionadoTexto: textoOpcional(60),
    /** Recibo de nómina del trabajador. Obligatorio si el egreso es nómina. */
    reciboNominaId: idOpcional,
    beneficiarioNombre: esquemaNombrePersona,
    beneficiarioIdTipo: esquemaIdentificacion.shape.tipo,
    beneficiarioIdNumero: esquemaIdentificacion.shape.numero,
    /** Qué socio retira. Obligatorio si el concepto es retiro de utilidades. */
    socioUsuarioId: idOpcional,
    /**
     * Sólo las formas marcadas `afecta_caja_fisica` restan del arqueo del
     * corte; el catálogo lo decide, no este módulo.
     */
    formaPago: esquemaCodigoCatalogo,
    importe: esquemaImporteMonetario,
  })
  // Las tres comprobaciones que siguen repiten CHECKs de la tabla. Se repiten
  // para poder señalar el campo exacto en el formulario: el CHECK llega como
  // 23514 y la UI sólo podría decir "revisa los datos". La autoridad sigue
  // siendo la base; esto es un aviso temprano, no la regla.
  .superRefine((datos, ctx) => {
    if (datos.conceptoCodigo === CONCEPTO_OTRO && !datos.conceptoOtro) {
      ctx.addIssue({
        code: "custom",
        path: ["conceptoOtro"],
        message: "Escribe cuál es el concepto del egreso",
      });
    }
    if (datos.conceptoCodigo === CONCEPTO_NOMINA && datos.reciboNominaId === null) {
      ctx.addIssue({
        code: "custom",
        path: ["reciboNominaId"],
        message: "Un pago de nómina debe citar el recibo del trabajador",
      });
    }
    if (datos.conceptoCodigo === CONCEPTO_RETIRO_SOCIO && datos.socioUsuarioId === null) {
      ctx.addIssue({
        code: "custom",
        path: ["socioUsuarioId"],
        message:
          "Indica qué socio retira: sin eso no hay a quién cargarle el anticipo cuando se haga el reparto formal",
      });
    }
  });

export type EntradaValeEgreso = z.input<typeof esquemaValeEgreso>;

export type ValeEgreso = {
  documentoId: number;
  fechaHora: string;
  conceptoCodigo: string;
  conceptoOtro: string | null;
  folioRelacionadoId: number | null;
  folioRelacionadoTexto: string | null;
  reciboNominaId: number | null;
  beneficiarioNombre: string;
  beneficiarioIdTipo: string;
  beneficiarioIdNumero: string;
  socioUsuarioId: number | null;
  formaPago: string;
  /** Cadena, nunca number: numeric(18,2) no cabe sin perder centavos. */
  importe: string;
};

type FilaValeEgreso = {
  documento_id: string | number;
  fecha_hora: Date | string;
  concepto_codigo: string;
  concepto_otro: string | null;
  folio_relacionado_id: string | number | null;
  folio_relacionado_texto: string | null;
  recibo_nomina_id: string | number | null;
  beneficiario_nombre: string;
  beneficiario_id_tipo: string;
  beneficiario_id_numero: string;
  socio_usuario_id: string | number | null;
  forma_pago: string;
  importe: string;
};

const COLUMNAS_VALE_EGRESO = `documento_id, fecha_hora, concepto_codigo, concepto_otro,
         folio_relacionado_id, folio_relacionado_texto, recibo_nomina_id,
         beneficiario_nombre, beneficiario_id_tipo, beneficiario_id_numero,
         socio_usuario_id, forma_pago, importe`;

function filaAValeEgreso(fila: FilaValeEgreso): ValeEgreso {
  return {
    documentoId: aNumero(fila.documento_id),
    fechaHora: aIso(fila.fecha_hora),
    conceptoCodigo: fila.concepto_codigo,
    conceptoOtro: fila.concepto_otro,
    folioRelacionadoId: aNumeroOpcional(fila.folio_relacionado_id),
    folioRelacionadoTexto: fila.folio_relacionado_texto,
    reciboNominaId: aNumeroOpcional(fila.recibo_nomina_id),
    beneficiarioNombre: fila.beneficiario_nombre,
    beneficiarioIdTipo: fila.beneficiario_id_tipo,
    beneficiarioIdNumero: fila.beneficiario_id_numero,
    socioUsuarioId: aNumeroOpcional(fila.socio_usuario_id),
    formaPago: fila.forma_pago,
    importe: fila.importe,
  };
}

/**
 * Captura o corrige el vale de egreso. Una sola fila por folio: se inserta la
 * primera vez y se actualiza en las siguientes, porque el vale ES el folio y
 * no una lista de versiones.
 *
 * Si el documento ya está firmado o cancelado, el disparador
 * `vale_egreso_rci05_congelado` lo impide y pide emitir un complementario.
 *
 * El aviso por retiro de socio sin reparto que lo respalde lo levanta el
 * disparador `vale_egreso_avisa_retiro` al insertar; aquí no se duplica ni se
 * adelanta, porque quien decide si el saldo alcanza es la vista
 * `v_anticipo_utilidades_socio` en el instante de guardar.
 */
export async function capturarValeEgreso(
  documentoId: number,
  datos: EntradaValeEgreso,
  usuario: number,
): Promise<ValeEgreso> {
  const id = esquemaId.parse(documentoId);
  const usuarioId = esquemaId.parse(usuario);
  const vale = esquemaValeEgreso.parse(datos);

  return withTransaction(async (cliente) => {
    await reabrirSiEstabaEnFirma(cliente, id, usuarioId);

    const { rows } = await cliente.query<FilaValeEgreso>(
      `INSERT INTO traza.vale_egreso_rci05
         (documento_id, fecha_hora, concepto_codigo, concepto_otro,
          folio_relacionado_id, folio_relacionado_texto, recibo_nomina_id,
          beneficiario_nombre, beneficiario_id_tipo, beneficiario_id_numero,
          socio_usuario_id, forma_pago, importe)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (documento_id) DO UPDATE
          SET fecha_hora              = EXCLUDED.fecha_hora,
              concepto_codigo         = EXCLUDED.concepto_codigo,
              concepto_otro           = EXCLUDED.concepto_otro,
              folio_relacionado_id    = EXCLUDED.folio_relacionado_id,
              folio_relacionado_texto = EXCLUDED.folio_relacionado_texto,
              recibo_nomina_id        = EXCLUDED.recibo_nomina_id,
              beneficiario_nombre     = EXCLUDED.beneficiario_nombre,
              beneficiario_id_tipo    = EXCLUDED.beneficiario_id_tipo,
              beneficiario_id_numero  = EXCLUDED.beneficiario_id_numero,
              socio_usuario_id        = EXCLUDED.socio_usuario_id,
              forma_pago              = EXCLUDED.forma_pago,
              importe                 = EXCLUDED.importe
       RETURNING ${COLUMNAS_VALE_EGRESO}`,
      [
        id,
        vale.fechaHora,
        vale.conceptoCodigo,
        vale.conceptoOtro,
        vale.folioRelacionadoId,
        vale.folioRelacionadoTexto,
        vale.reciboNominaId,
        vale.beneficiarioNombre,
        vale.beneficiarioIdTipo,
        vale.beneficiarioIdNumero,
        vale.socioUsuarioId,
        vale.formaPago,
        vale.importe,
      ],
    );
    return filaAValeEgreso(rows[0]);
  });
}

export async function obtenerValeEgreso(documentoId: number): Promise<ValeEgreso | null> {
  const id = esquemaId.parse(documentoId);
  const { rows } = await query<FilaValeEgreso>(
    `SELECT ${COLUMNAS_VALE_EGRESO}
       FROM traza.vale_egreso_rci05
      WHERE documento_id = $1`,
    [id],
  );
  return rows[0] ? filaAValeEgreso(rows[0]) : null;
}

// ===== FIRMAS DEL VALE =====

/** Firma que el vale todavía no tiene, con lo que la pantalla necesita pedirla. */
export type FirmaFaltanteVale = {
  rol: RolFirmante;
  etiqueta: string;
  /** Decide qué formulario mostrar: PIN propio o rúbrica presencial atestiguada. */
  exigeUsuarioInterno: boolean;
};

export type EstadoFirmasVale = EstadoValeEgreso & {
  documentoId: number;
  /** Los mismos `rolesFaltantes`, ya con su etiqueta para la pantalla. */
  faltantes: FirmaFaltanteVale[];
};

/**
 * Qué firma falta y si alguien está ocupando dos roles del mismo vale.
 *
 * El cálculo lo hace `estadoValeEgreso` sobre las firmas REALES; aquí sólo se
 * leen. Que las tres firmas correspondan a personas distintas lo impone el
 * índice único parcial (documento_id, usuario_id) al intentar firmar: esto se
 * adelanta a ese error para que quien opera lo sepa antes de reunir a la
 * gente, no cuando ya está frente al lector de PIN.
 *
 * Sólo cuentan los firmantes internos, que son los que llevan `usuario_id`. El
 * beneficiario es un tercero que firma de forma presencial y no tiene cuenta,
 * así que no puede "repetirse" con nadie.
 *
 * Devuelve null si el folio no existe o no es un vale de egreso: preguntar por
 * las firmas de un vale a un documento que no lo es no tiene respuesta útil.
 */
export async function estadoFirmasVale(documentoId: number): Promise<EstadoFirmasVale | null> {
  const id = esquemaId.parse(documentoId);

  const { rows } = await query<{
    tipo_codigo: string;
    rol_firmante: string | null;
    usuario_id: string | number | null;
  }>(
    `SELECT d.tipo_codigo, f.rol_firmante, f.usuario_id
       FROM traza.documento_financiero d
       LEFT JOIN traza.firma_documento_financiero f ON f.documento_id = d.id
      WHERE d.id = $1`,
    [id],
  );

  if (rows.length === 0 || rows[0].tipo_codigo !== TIPO_VALE) return null;

  const firmas: FirmaVale[] = rows
    .filter((fila) => fila.rol_firmante !== null)
    .map((fila) => ({
      rolFirmante: fila.rol_firmante as string,
      usuarioId: aNumeroOpcional(fila.usuario_id),
    }));

  const estado = estadoValeEgreso(firmas);

  return {
    ...estado,
    documentoId: id,
    faltantes: estado.rolesFaltantes.map((rol) => {
      const ficha = CATALOGO_ROL_FIRMANTE[rol as RolFirmante];
      return {
        rol: rol as RolFirmante,
        etiqueta: ficha.etiqueta,
        exigeUsuarioInterno: ficha.exigeUsuarioInterno,
      };
    }),
  };
}

// ===== CACM-RCI-06 — RECIBO DE PAGO DE NÓMINA =====

/**
 * Partida de nómina que el papel deja en blanco cuando no aplica. Un renglón
 * vacío es cero, no "sin dato": la columna es NOT NULL DEFAULT 0 y los totales
 * generados tienen que poder sumarla.
 */
const esquemaPartidaNomina = z
  .string()
  .nullish()
  .transform((valor) => (valor ?? "").trim())
  .pipe(esquemaImporteNoNegativo.or(z.literal("").transform(() => "0.00")));

/** Orden del papel: trabajador, período, percepciones, deducciones, pago. */
export const esquemaReciboNomina = z
  .object({
    /** El trabajador no es forzosamente un usuario del sistema. */
    empleadoId: esquemaId,
    periodoInicio: esquemaFechaIso,
    periodoFin: esquemaFechaIso,
    percepcionSueldo: esquemaPartidaNomina,
    percepcionComisiones: esquemaPartidaNomina,
    percepcionOtras: esquemaPartidaNomina,
    deduccionIsr: esquemaPartidaNomina,
    deduccionImssInfonavit: esquemaPartidaNomina,
    deduccionOtras: esquemaPartidaNomina,
    formaPago: esquemaCodigoCatalogo,
  })
  // Aviso temprano de dos CHECKs de la tabla, para poder señalar el campo. La
  // regla la sigue imponiendo la base.
  .superRefine((datos, ctx) => {
    if (datos.periodoFin < datos.periodoInicio) {
      ctx.addIssue({
        code: "custom",
        path: ["periodoFin"],
        message: "El período no puede terminar antes de empezar",
      });
    }

    // En centavos enteros: comparar percepciones y deducciones como double
    // dejaría pasar un neto negativo de un centavo.
    const percepciones =
      (aCentavos(datos.percepcionSueldo) ?? 0n) +
      (aCentavos(datos.percepcionComisiones) ?? 0n) +
      (aCentavos(datos.percepcionOtras) ?? 0n);
    const deducciones =
      (aCentavos(datos.deduccionIsr) ?? 0n) +
      (aCentavos(datos.deduccionImssInfonavit) ?? 0n) +
      (aCentavos(datos.deduccionOtras) ?? 0n);

    if (deducciones > percepciones) {
      ctx.addIssue({
        code: "custom",
        path: ["deduccionOtras"],
        message: `Las deducciones (${deCentavos(deducciones)}) superan las percepciones (${deCentavos(
          percepciones,
        )}); un neto negativo significaría que el trabajador le debe a la empresa por su propio recibo de sueldo`,
      });
    }
  });

export type EntradaReciboNomina = z.input<typeof esquemaReciboNomina>;

export type ReciboNomina = {
  documentoId: number;
  empleadoId: number;
  /** Fecha civil AAAA-MM-DD, tal como la guarda la columna `date`. */
  periodoInicio: string;
  periodoFin: string;
  percepcionSueldo: string;
  percepcionComisiones: string;
  percepcionOtras: string;
  /** Columna GENERATED: la suma la hace la base, aquí sólo se lee. */
  totalPercepciones: string;
  deduccionIsr: string;
  deduccionImssInfonavit: string;
  deduccionOtras: string;
  /** Columna GENERATED. */
  totalDeducciones: string;
  /** Columna GENERATED: percepciones − deducciones. Es lo que se le entrega. */
  netoPagado: string;
  formaPago: string;
};

type FilaReciboNomina = {
  documento_id: string | number;
  empleado_id: string | number;
  periodo_inicio: string;
  periodo_fin: string;
  percepcion_sueldo: string;
  percepcion_comisiones: string;
  percepcion_otras: string;
  total_percepciones: string;
  deduccion_isr: string;
  deduccion_imss_infonavit: string;
  deduccion_otras: string;
  total_deducciones: string;
  neto_pagado: string;
  forma_pago: string;
};

/**
 * Las fechas se piden como texto: el driver convierte una columna `date` en un
 * Date de JavaScript a medianoche local, y un período quincenal no puede
 * cambiar de día según dónde corra el proceso.
 *
 * Los tres totales se leen, nunca se escriben: son columnas GENERATED ALWAYS.
 */
const COLUMNAS_RECIBO_NOMINA = `documento_id, empleado_id,
         periodo_inicio::text AS periodo_inicio, periodo_fin::text AS periodo_fin,
         percepcion_sueldo, percepcion_comisiones, percepcion_otras, total_percepciones,
         deduccion_isr, deduccion_imss_infonavit, deduccion_otras, total_deducciones,
         neto_pagado, forma_pago`;

function filaAReciboNomina(fila: FilaReciboNomina): ReciboNomina {
  return {
    documentoId: aNumero(fila.documento_id),
    empleadoId: aNumero(fila.empleado_id),
    periodoInicio: fila.periodo_inicio,
    periodoFin: fila.periodo_fin,
    percepcionSueldo: fila.percepcion_sueldo,
    percepcionComisiones: fila.percepcion_comisiones,
    percepcionOtras: fila.percepcion_otras,
    totalPercepciones: fila.total_percepciones,
    deduccionIsr: fila.deduccion_isr,
    deduccionImssInfonavit: fila.deduccion_imss_infonavit,
    deduccionOtras: fila.deduccion_otras,
    totalDeducciones: fila.total_deducciones,
    netoPagado: fila.neto_pagado,
    formaPago: fila.forma_pago,
  };
}

/**
 * Captura o corrige el recibo de nómina.
 *
 * LOS TOTALES Y EL NETO NO SE MANDAN: `total_percepciones`,
 * `total_deducciones` y `neto_pagado` son columnas GENERATED ALWAYS y Postgres
 * rechaza cualquier intento de escribirlas. Se devuelven leyendo la fila ya
 * guardada (RETURNING), de modo que lo que la pantalla muestra sea lo que la
 * base calculó y no una segunda aritmética hecha aquí que podría no coincidir.
 *
 * Que un mismo trabajador no cobre dos veces el mismo período lo impone la
 * UNIQUE (empleado_id, periodo_inicio, periodo_fin); un segundo folio con el
 * mismo período sale como 23505.
 *
 * OJO: el recibo NO mueve la caja. El efectivo de la nómina sale por su vale
 * (RCI-05, concepto PAGO_NOMINA, citando este recibo); contar ambos duplicaría
 * el egreso del corte. Así lo arma `armar_corte_caja`.
 */
export async function capturarReciboNomina(
  documentoId: number,
  datos: EntradaReciboNomina,
  usuario: number,
): Promise<ReciboNomina> {
  const id = esquemaId.parse(documentoId);
  const usuarioId = esquemaId.parse(usuario);
  const recibo = esquemaReciboNomina.parse(datos);

  return withTransaction(async (cliente) => {
    await reabrirSiEstabaEnFirma(cliente, id, usuarioId);

    const { rows } = await cliente.query<FilaReciboNomina>(
      `INSERT INTO traza.recibo_nomina_rci06
         (documento_id, empleado_id, periodo_inicio, periodo_fin,
          percepcion_sueldo, percepcion_comisiones, percepcion_otras,
          deduccion_isr, deduccion_imss_infonavit, deduccion_otras, forma_pago)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (documento_id) DO UPDATE
          SET empleado_id              = EXCLUDED.empleado_id,
              periodo_inicio           = EXCLUDED.periodo_inicio,
              periodo_fin              = EXCLUDED.periodo_fin,
              percepcion_sueldo        = EXCLUDED.percepcion_sueldo,
              percepcion_comisiones    = EXCLUDED.percepcion_comisiones,
              percepcion_otras         = EXCLUDED.percepcion_otras,
              deduccion_isr            = EXCLUDED.deduccion_isr,
              deduccion_imss_infonavit = EXCLUDED.deduccion_imss_infonavit,
              deduccion_otras          = EXCLUDED.deduccion_otras,
              forma_pago               = EXCLUDED.forma_pago
       RETURNING ${COLUMNAS_RECIBO_NOMINA}`,
      [
        id,
        recibo.empleadoId,
        recibo.periodoInicio,
        recibo.periodoFin,
        recibo.percepcionSueldo,
        recibo.percepcionComisiones,
        recibo.percepcionOtras,
        recibo.deduccionIsr,
        recibo.deduccionImssInfonavit,
        recibo.deduccionOtras,
        recibo.formaPago,
      ],
    );
    return filaAReciboNomina(rows[0]);
  });
}

export async function obtenerReciboNomina(documentoId: number): Promise<ReciboNomina | null> {
  const id = esquemaId.parse(documentoId);
  const { rows } = await query<FilaReciboNomina>(
    `SELECT ${COLUMNAS_RECIBO_NOMINA}
       FROM traza.recibo_nomina_rci06
      WHERE documento_id = $1`,
    [id],
  );
  return rows[0] ? filaAReciboNomina(rows[0]) : null;
}

// ===== ANTICIPOS DE SOCIOS =====

/**
 * POR QUÉ EL RETIRO DE UN SOCIO ES ANTICIPO Y NO REPARTO.
 *
 * Cuando un socio saca dinero de la caja, la tentación contable es anotarlo
 * como "utilidades repartidas" y darlo por cerrado. El sistema NO lo permite,
 * y no por prudencia administrativa sino porque el artículo 19 de la Ley
 * General de Sociedades Mercantiles condiciona el reparto a un hecho que en
 * ese momento todavía no existe:
 *
 *  1. La distribución de utilidades sólo puede hacerse DESPUÉS de que la
 *     asamblea de socios apruebe estados financieros que efectivamente las
 *     arrojen. Sin balance aprobado no hay utilidad que repartir: hay caja,
 *     que es otra cosa. Una empresa puede tener efectivo y estar en pérdida.
 *  2. Tampoco puede repartirse mientras no se hayan restituido o absorbido las
 *     pérdidas de ejercicios anteriores. La utilidad repartible es lo que
 *     queda después de eso, no lo que hay en el cajón un martes.
 *  3. Un reparto hecho en contravención de ese artículo no queda firme: la
 *     sociedad y sus acreedores pueden repetir contra quien recibió el dinero,
 *     y los administradores que lo pagaron responden solidariamente. Presentar
 *     el retiro como utilidad repartida no protege a nadie; sólo borra el
 *     rastro de que hay algo que devolver.
 *
 * De ahí la lectura del sistema: mientras no exista un `reparto_utilidades`
 * que lo respalde, lo retirado es un ANTICIPO A CUENTA —saldo POR COMPROBAR,
 * dinero que el socio debe a la sociedad— y nunca un gasto cerrado. Por eso el
 * catálogo marca el concepto con `es_anticipo_utilidades`, el vale exige decir
 * QUÉ socio retira (o no habría a quién cargarle el anticipo), el disparador
 * `avisar_retiro_socio_sin_respaldo` deja aviso al gerente en lugar de
 * bloquear —la empresa puede necesitar entregar el dinero, lo que no puede es
 * fingir que ya se repartió— y `posicionSocio` etiqueta el saldo con esas
 * palabras exactas.
 *
 * El reparto formal es el único hecho que convierte anticipo en utilidad
 * repartida: por eso `registrarRepartoUtilidades` exige ejercicio, fecha del
 * balance y acta que lo aprobó, y por eso esas filas son inmutables.
 */
export type AnticipoSocio = PosicionSocio & {
  socioUsuarioId: number;
  socioNombre: string;
};

type FilaAnticipoSocio = {
  socio_usuario_id: string | number;
  socio_nombre: string;
  total_anticipos: string;
  total_repartido: string;
};

/**
 * Posición de cada socio que ha retirado dinero o recibido reparto: cuánto
 * lleva anticipado, cuánto respalda un balance formal y cuánto queda por
 * comprobar.
 *
 * La resta ya la hace la vista, pero la ETIQUETA con la que esto se presenta
 * la pone `posicionSocio`: "anticipo a cuenta de utilidades — saldo por
 * comprobar" mientras el reparto no exista. Esa frase es la regla del artículo
 * 19 dicha en pantalla, y por eso no se redacta aquí una versión propia.
 *
 * Primero los saldos mayores: es el orden en que un gerente necesita verlos.
 */
export async function anticiposDeSocios(): Promise<AnticipoSocio[]> {
  const { rows } = await query<FilaAnticipoSocio>(
    `SELECT a.socio_usuario_id,
            a.socio_nombre,
            a.total_anticipos,
            a.total_repartido
       FROM traza.v_anticipo_utilidades_socio a
      ORDER BY a.saldo_por_comprobar DESC, a.socio_nombre`,
  );

  return rows.map((fila) => {
    const posicion = posicionSocio({
      totalAnticipos: fila.total_anticipos,
      totalRepartido: fila.total_repartido,
    });

    // La vista entrega numeric(18,2), así que esto no ocurre. Si ocurriera,
    // callarlo sería omitir de la lista a un socio con dinero por comprobar.
    if (!posicion) {
      throw new Error(
        `No se pudo interpretar la posición de anticipos del socio ${fila.socio_nombre}`,
      );
    }

    return {
      ...posicion,
      socioUsuarioId: aNumero(fila.socio_usuario_id),
      socioNombre: fila.socio_nombre,
    };
  });
}

// ===== REPARTO FORMAL DE UTILIDADES =====

export const esquemaRepartoUtilidades = z
  .object({
    /** Ejercicio o período del balance: 2026, 2026-S1, 2026-T3. */
    ejercicio: z
      .string()
      .trim()
      .regex(
        /^[0-9]{4}(-[ST][1-4])?$/,
        "El ejercicio se escribe como 2026, o 2026-S1 / 2026-T3 para un semestre o trimestre",
      ),
    /** Fecha del balance que arroja la utilidad, no la fecha del pago. */
    fechaBalance: esquemaFechaIso,
    utilidadRepartible: esquemaImporteNoNegativo,
    /** Acta de asamblea que aprobó los estados financieros. */
    actaReferencia: z
      .string()
      .trim()
      .min(3, "Cita el acta de asamblea que aprobó el balance")
      .max(200),
    asignaciones: z
      .array(
        z.object({
          socioUsuarioId: esquemaId,
          monto: esquemaImporteNoNegativo,
        }),
      )
      .nonempty("Un reparto sin asignaciones no reparte nada")
      .max(50, "Revisa la lista de socios: son demasiados renglones para un reparto"),
  })
  .superRefine((datos, ctx) => {
    const vistos = new Set<number>();
    datos.asignaciones.forEach((asignacion, indice) => {
      if (vistos.has(asignacion.socioUsuarioId)) {
        // La llave primaria (reparto_id, socio_usuario_id) lo impediría con un
        // 23505 sin contexto; aquí se puede señalar el renglón repetido.
        ctx.addIssue({
          code: "custom",
          path: ["asignaciones", indice, "socioUsuarioId"],
          message: "Ese socio ya tiene un renglón en este reparto; súmalo en uno solo",
        });
      }
      vistos.add(asignacion.socioUsuarioId);
    });

    // ESTA COMPROBACIÓN NO DUPLICA NINGÚN CANDADO: el esquema no la tiene, y
    // repartir más de lo que el balance arroja no sería reparto de utilidades
    // sino entrega de capital, justo lo que el artículo 19 de la LGSM impide
    // y por lo que la sociedad puede repetir contra quien lo recibió.
    // Se suma en centavos enteros porque un reparto que se pase por un centavo
    // se pasa igual.
    const repartible = aCentavos(datos.utilidadRepartible);
    const asignado = datos.asignaciones.reduce(
      (acumulado, asignacion) => acumulado + (aCentavos(asignacion.monto) ?? 0n),
      0n,
    );

    if (repartible !== null && asignado > repartible) {
      ctx.addIssue({
        code: "custom",
        path: ["asignaciones"],
        message: `Las asignaciones suman ${deCentavos(asignado)} y el balance sólo arroja ${deCentavos(
          repartible,
        )} de utilidad repartible`,
      });
    }
  });

export type EntradaRepartoUtilidades = z.input<typeof esquemaRepartoUtilidades>;

export type AsignacionReparto = {
  socioUsuarioId: number;
  socioNombre: string;
  montoAsignado: string;
};

export type RepartoUtilidades = {
  id: number;
  ejercicio: string;
  fechaBalance: string;
  utilidadRepartible: string;
  actaReferencia: string;
  autorizadoPor: number;
  creadoEn: string;
  asignaciones: AsignacionReparto[];
  /** Utilidad que el balance arroja y este reparto dejó sin asignar. */
  remanenteSinAsignar: string;
};

/**
 * Asienta el reparto formal y sus asignaciones por socio.
 *
 * Es el hecho que convierte los anticipos en utilidad repartida: hasta que
 * existe, todo retiro de socio es saldo por comprobar (ver la nota del
 * artículo 19 más arriba). Por eso pide ejercicio, fecha del balance y acta:
 * sin esos tres datos no hay manera de sostener que hubo utilidades.
 *
 * TODO EN UNA TRANSACCIÓN: un reparto cuya cabecera existiera sin sus
 * asignaciones diría que se repartieron utilidades sin decir a quién, y las
 * dos tablas son inmutables (`bloquear_mutacion` en UPDATE y DELETE), así que
 * ese estado a medias no se podría corregir después. O queda completo, o no
 * queda nada.
 *
 * Un ejercicio se reparte UNA vez: la UNIQUE (ejercicio) devuelve 23505 en el
 * segundo intento.
 *
 * No cierra las alertas de retiro sin respaldo que hubiera abiertas: quién
 * revisó qué y con qué nota es un acto humano, y para eso está `atenderAlerta`.
 */
export async function registrarRepartoUtilidades(
  entrada: EntradaRepartoUtilidades,
  usuario: number,
): Promise<RepartoUtilidades> {
  const datos = esquemaRepartoUtilidades.parse(entrada);
  const usuarioId = esquemaId.parse(usuario);

  return withTransaction(async (cliente) => {
    const cabecera = await cliente.query<{
      id: string | number;
      ejercicio: string;
      fecha_balance: string;
      utilidad_repartible: string;
      acta_referencia: string;
      autorizado_por: string | number;
      creado_en: Date | string;
    }>(
      `INSERT INTO traza.reparto_utilidades
         (ejercicio, fecha_balance, utilidad_repartible, acta_referencia, autorizado_por)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, ejercicio, fecha_balance::text AS fecha_balance,
                 utilidad_repartible, acta_referencia, autorizado_por, creado_en`,
      [
        datos.ejercicio,
        datos.fechaBalance,
        datos.utilidadRepartible,
        datos.actaReferencia,
        usuarioId,
      ],
    );
    const reparto = cabecera.rows[0];

    await cliente.query(
      `INSERT INTO traza.reparto_utilidades_socio (reparto_id, socio_usuario_id, monto_asignado)
       SELECT $1, a.socio, a.monto
         FROM unnest($2::bigint[], $3::numeric[]) AS a(socio, monto)`,
      [
        reparto.id,
        datos.asignaciones.map((asignacion) => asignacion.socioUsuarioId),
        datos.asignaciones.map((asignacion) => asignacion.monto),
      ],
    );

    // Se releen ya guardadas para devolver el nombre del socio junto al monto
    // y en un orden estable: de mayor a menor asignación.
    const asignaciones = await cliente.query<{
      socio_usuario_id: string | number;
      socio_nombre: string;
      monto_asignado: string;
    }>(
      `SELECT rs.socio_usuario_id, u.nombre AS socio_nombre, rs.monto_asignado
         FROM traza.reparto_utilidades_socio rs
         JOIN traza.usuario u ON u.id = rs.socio_usuario_id
        WHERE rs.reparto_id = $1
        ORDER BY rs.monto_asignado DESC, u.nombre`,
      [reparto.id],
    );

    const asignado = asignaciones.rows.reduce(
      (acumulado, fila) => acumulado + (aCentavos(fila.monto_asignado) ?? 0n),
      0n,
    );
    const remanente = (aCentavos(reparto.utilidad_repartible) ?? 0n) - asignado;

    return {
      id: aNumero(reparto.id),
      ejercicio: reparto.ejercicio,
      fechaBalance: reparto.fecha_balance,
      utilidadRepartible: reparto.utilidad_repartible,
      actaReferencia: reparto.acta_referencia,
      autorizadoPor: aNumero(reparto.autorizado_por),
      creadoEn: aIso(reparto.creado_en),
      asignaciones: asignaciones.rows.map((fila) => ({
        socioUsuarioId: aNumero(fila.socio_usuario_id),
        socioNombre: fila.socio_nombre,
        montoAsignado: fila.monto_asignado,
      })),
      remanenteSinAsignar: deCentavos(remanente),
    };
  });
}

// ===== ALERTAS =====

/**
 * Los cuatro tipos que admite el CHECK de `alerta_finanzas`. A diferencia de
 * los conceptos de cobro o de egreso —que son catálogos administrables— éstos
 * los levanta el propio esquema desde sus disparadores, así que enumerarlos
 * aquí no le quita a nadie la posibilidad de dar de alta uno nuevo.
 */
export const TIPOS_ALERTA_FINANZAS = [
  "FALTANTE_DE_CAJA",
  "CUSTODIA_PENDIENTE",
  "RETIRO_SOCIO_SIN_RESPALDO",
  "DIFERENCIA_DE_CAJA",
] as const;

export type TipoAlertaFinanzas = (typeof TIPOS_ALERTA_FINANZAS)[number];

export const ETIQUETA_ALERTA_FINANZAS: Record<TipoAlertaFinanzas, string> = {
  FALTANTE_DE_CAJA: "Faltante de caja",
  CUSTODIA_PENDIENTE: "Custodia sin confirmar",
  RETIRO_SOCIO_SIN_RESPALDO: "Retiro de socio sin reparto que lo respalde",
  DIFERENCIA_DE_CAJA: "Diferencia de caja",
};

/** Un faltante escala al Gerente General; un sobrante sólo avisa. */
export type SeveridadAlerta = "AVISO" | "GRAVE";

export type AlertaFinanzas = {
  id: number;
  tipo: TipoAlertaFinanzas;
  severidad: SeveridadAlerta;
  sucursalId: number | null;
  sucursalClave: string | null;
  /** Folio que originó la alerta, cuando lo hubo. */
  documentoId: number | null;
  folio: string | null;
  folioCompleto: string | null;
  tipoDocumento: TipoRci | null;
  mensaje: string;
  creadaEn: string;
  atendidaPor: number | null;
  atendidaPorNombre: string | null;
  atendidaEn: string | null;
  notaAtencion: string | null;
};

type FilaAlerta = {
  id: string | number;
  tipo: string;
  severidad: string;
  sucursal_id: string | number | null;
  sucursal_clave: string | null;
  documento_id: string | number | null;
  folio: string | null;
  folio_completo: string | null;
  tipo_documento: string | null;
  mensaje: string;
  creada_en: Date | string;
  atendida_por: string | number | null;
  atendida_por_nombre: string | null;
  atendida_en: Date | string | null;
  nota_atencion: string | null;
};

/** Proyección única de la alerta. SQL fijo: no interpola valor alguno. */
const SELECT_ALERTA = `
  SELECT a.id,
         a.tipo,
         a.severidad,
         a.sucursal_id,
         s.clave AS sucursal_clave,
         a.documento_id,
         v.folio,
         v.folio_completo,
         v.tipo_codigo AS tipo_documento,
         a.mensaje,
         a.creada_en,
         a.atendida_por,
         u.nombre AS atendida_por_nombre,
         a.atendida_en,
         a.nota_atencion
    FROM traza.alerta_finanzas a
    LEFT JOIN traza.sucursal s ON s.id = a.sucursal_id
    LEFT JOIN traza.v_documento_financiero v ON v.id = a.documento_id
    LEFT JOIN traza.usuario u ON u.id = a.atendida_por`;

function filaAAlerta(fila: FilaAlerta): AlertaFinanzas {
  return {
    id: aNumero(fila.id),
    tipo: fila.tipo as TipoAlertaFinanzas,
    severidad: fila.severidad as SeveridadAlerta,
    sucursalId: aNumeroOpcional(fila.sucursal_id),
    sucursalClave: fila.sucursal_clave,
    documentoId: aNumeroOpcional(fila.documento_id),
    folio: fila.folio,
    folioCompleto: fila.folio_completo,
    tipoDocumento: fila.tipo_documento as TipoRci | null,
    mensaje: fila.mensaje,
    creadaEn: aIso(fila.creada_en),
    atendidaPor: aNumeroOpcional(fila.atendida_por),
    atendidaPorNombre: fila.atendida_por_nombre,
    atendidaEn: aIsoOpcional(fila.atendida_en),
    notaAtencion: fila.nota_atencion,
  };
}

export const esquemaFiltroAlertas = z.object({
  tipo: z.enum(TIPOS_ALERTA_FINANZAS).optional(),
  sucursalId: esquemaId.optional(),
  /** Un tablero de alertas no se lee por miles de renglones. */
  limite: z.number().int().positive().max(1000).default(200),
});

export type FiltroAlertas = z.input<typeof esquemaFiltroAlertas>;

/**
 * Alertas todavía sin atender, las graves primero y dentro de cada grupo las
 * más recientes arriba.
 *
 * Las alertas son HECHOS, no banderas: no se borran ni se apagan solas. Una
 * diferencia de caja explicada sigue habiendo ocurrido; lo que cambia al
 * atenderla es que alguien se hizo cargo y dejó dicho qué encontró.
 */
export async function alertasAbiertas(filtro: FiltroAlertas = {}): Promise<AlertaFinanzas[]> {
  const { tipo, sucursalId, limite } = esquemaFiltroAlertas.parse(filtro);

  const { rows } = await query<FilaAlerta>(
    `${SELECT_ALERTA}
      WHERE a.atendida_en IS NULL
        AND ($1::text IS NULL OR a.tipo = $1)
        AND ($2::bigint IS NULL OR a.sucursal_id = $2)
      ORDER BY (a.severidad = 'GRAVE') DESC, a.creada_en DESC, a.id DESC
      LIMIT $3`,
    [tipo ?? null, sucursalId ?? null, limite],
  );

  return rows.map(filaAAlerta);
}

export type ResultadoAtenderAlerta = {
  alerta: AlertaFinanzas;
  /**
   * Falsa cuando alguien ya la había atendido: en ese caso no se sobreescribe
   * ni su nombre ni su nota, y la alerta se devuelve tal como quedó.
   */
  seAtendioAhora: boolean;
};

/**
 * Da por atendida una alerta abierta, a nombre de quien la revisó y con la
 * nota de lo que encontró.
 *
 * La nota no es opcional: una alerta atendida sin explicación no explica nada,
 * y el descargo de un faltante de caja es exactamente eso, un descargo. El
 * esquema no exige el largo mínimo —sólo obliga a que quién y cuándo vayan
 * juntos—, así que esta comprobación es de captura, no un candado duplicado.
 *
 * El WHERE exige que siga abierta: atender dos veces borraría el nombre y la
 * nota de quien lo hizo primero, y eso es reescribir un hecho registrado.
 * Devuelve null si la alerta no existe.
 */
export async function atenderAlerta(
  id: number,
  usuario: number,
  nota: string,
): Promise<ResultadoAtenderAlerta | null> {
  const alertaId = esquemaId.parse(id);
  const usuarioId = esquemaId.parse(usuario);
  const notaAtencion = z
    .string()
    .trim()
    .min(5, "Escribe qué se revisó o cómo se resolvió la alerta")
    .max(1000)
    .parse(nota);

  return withTransaction(async (cliente) => {
    const atendida = await cliente.query(
      `UPDATE traza.alerta_finanzas
          SET atendida_por  = $2,
              atendida_en   = clock_timestamp(),
              nota_atencion = $3
        WHERE id = $1
          AND atendida_en IS NULL`,
      [alertaId, usuarioId, notaAtencion],
    );

    const { rows } = await cliente.query<FilaAlerta>(`${SELECT_ALERTA} WHERE a.id = $1`, [
      alertaId,
    ]);
    if (!rows[0]) return null;

    return {
      alerta: filaAAlerta(rows[0]),
      seAtendioAhora: (atendida.rowCount ?? 0) > 0,
    };
  });
}

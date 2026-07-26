import "server-only";

import type { PoolClient } from "pg";
import { z } from "zod";

import { query, withTransaction } from "@/lib/db";
import { aCentavos, deCentavos } from "@/lib/finanzas/calculos";
import { firmarComoInterno } from "@/lib/finanzas/documentos";
import {
  HORAS_ALERTA_CUSTODIA,
  custodiaEstaVencida,
  etiquetaCustodia,
} from "@/lib/finanzas/formato";
import {
  esquemaFechaHoraIso,
  esquemaHashSha256,
  esquemaId,
  esquemaIdentificacion,
  esquemaImporteMonetario,
  esquemaPinFirma,
  esquemaVin,
  type EstadoDocumentoFinanciero,
  type TipoRci,
} from "@/lib/finanzas/tipos";

/**
 * Los dos recibos con los que entra dinero a la caja: CACM-RCI-01 (cobro por
 * venta de vehículo) y CACM-RCI-04 (cobro por servicio de taller). Comparten
 * el mismo recorrido —se captura, se arquea, lo entrega quien cobró y lo
 * recibe el Custodio Financiero— y por eso comparten módulo.
 *
 * Los candados viven en plpgsql (migraciones 034 y 035) y aquí sólo se
 * invocan: la inmutabilidad tras la firma la impone
 * `bloquear_detalle_documento_fin`, el cuadre del arqueo `validar_arqueo_rci01`
 * y la verificación del PIN `verificar_pin`. Cuando uno se dispara llega como
 * P0001 y debe propagarse tal cual; `respuestaError` de "@/lib/api" lo
 * convierte en un 409 legible. No se atrapa ni se reescribe nada de eso.
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

/** Misma idea para el VIN: vacío = el cobro no corresponde a una unidad. */
const esquemaVinOpcional = z
  .string()
  .nullish()
  .transform((valor) => (valor ?? "").trim())
  .pipe(esquemaVin.or(z.literal("").transform(() => null)));

/**
 * Código de un catálogo administrable (concepto de cobro, forma de pago).
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

// ===== CACM-RCI-01 — RECIBO DE CAJA INTERNO =====

/**
 * Los campos van en el ORDEN DEL PAPEL —vendedor, su identificación, cliente,
 * vehículo, VIN, fecha y hora del cobro, folio de venta, concepto e importe—
 * para que quien captura siga la forma impresa de arriba abajo sin buscar.
 */
export const esquemaReciboCaja = z
  .object({
    /** Empleado que cobró. El catálogo de personal es independiente del de usuarios. */
    vendedorEmpleadoId: esquemaId,
    vendedorIdTipo: esquemaIdentificacion.shape.tipo,
    vendedorIdNumero: esquemaIdentificacion.shape.numero,
    clienteNombre: z
      .string()
      .trim()
      .min(3, "Captura el nombre del cliente")
      .max(160),
    vehiculoDescripcion: textoOpcional(200),
    vin: esquemaVinOpcional,
    /**
     * Con huso horario explícito: esa hora decide a qué corte de caja
     * pertenece el folio y a partir de ella se cuenta la custodia en tránsito.
     */
    fechaHoraCobro: esquemaFechaHoraIso,
    /** Folio de venta del expediente, cuando la operación vive en uno. */
    documentoVentaId: esquemaId.nullish().transform((valor) => valor ?? null),
    /** Folio de venta escrito a mano, para operaciones ajenas al expediente. */
    folioVentaTexto: textoOpcional(60),
    conceptoCodigo: esquemaCodigoCatalogo,
    conceptoOtro: textoOpcional(160),
    importeTotal: esquemaImporteMonetario,
  })
  // Las dos comprobaciones que siguen repiten CHECKs de la tabla. Se repiten
  // para poder señalar el campo exacto en el formulario: el CHECK llega como
  // 23514 y la UI sólo puede decir "revisa los datos". La autoridad sigue
  // siendo la base; esto es un aviso temprano, no la regla.
  .superRefine((datos, ctx) => {
    if (datos.documentoVentaId === null && !datos.folioVentaTexto) {
      ctx.addIssue({
        code: "custom",
        path: ["folioVentaTexto"],
        message: "Indica el folio de venta que ampara el cobro",
      });
    }
    if (datos.conceptoCodigo === CONCEPTO_OTRO && !datos.conceptoOtro) {
      ctx.addIssue({
        code: "custom",
        path: ["conceptoOtro"],
        message: "Escribe cuál es el concepto del cobro",
      });
    }
  });

export type EntradaReciboCaja = z.input<typeof esquemaReciboCaja>;

export type ReciboCaja = {
  documentoId: number;
  vendedorEmpleadoId: number;
  vendedorIdTipo: string;
  vendedorIdNumero: string;
  clienteNombre: string;
  vehiculoDescripcion: string | null;
  vin: string | null;
  fechaHoraCobro: string;
  documentoVentaId: number | null;
  folioVentaTexto: string | null;
  conceptoCodigo: string;
  conceptoOtro: string | null;
  /** Cadena, nunca number: numeric(18,2) no cabe sin perder centavos. */
  importeTotal: string;
};

type FilaReciboCaja = {
  documento_id: string | number;
  vendedor_empleado_id: string | number;
  vendedor_id_tipo: string;
  vendedor_id_numero: string;
  cliente_nombre: string;
  vehiculo_descripcion: string | null;
  vin: string | null;
  fecha_hora_cobro: Date | string;
  documento_venta_id: string | number | null;
  folio_venta_texto: string | null;
  concepto_codigo: string;
  concepto_otro: string | null;
  importe_total: string;
};

const COLUMNAS_RECIBO_CAJA = `documento_id, vendedor_empleado_id, vendedor_id_tipo,
         vendedor_id_numero, cliente_nombre, vehiculo_descripcion, vin,
         fecha_hora_cobro, documento_venta_id, folio_venta_texto,
         concepto_codigo, concepto_otro, importe_total`;

function filaAReciboCaja(fila: FilaReciboCaja): ReciboCaja {
  return {
    documentoId: aNumero(fila.documento_id),
    vendedorEmpleadoId: aNumero(fila.vendedor_empleado_id),
    vendedorIdTipo: fila.vendedor_id_tipo,
    vendedorIdNumero: fila.vendedor_id_numero,
    clienteNombre: fila.cliente_nombre,
    vehiculoDescripcion: fila.vehiculo_descripcion,
    vin: fila.vin,
    fechaHoraCobro: aIso(fila.fecha_hora_cobro),
    documentoVentaId: aNumeroOpcional(fila.documento_venta_id),
    folioVentaTexto: fila.folio_venta_texto,
    conceptoCodigo: fila.concepto_codigo,
    conceptoOtro: fila.concepto_otro,
    importeTotal: fila.importe_total,
  };
}

/**
 * Devuelve a BORRADOR un folio que ya se había enviado a firma.
 *
 * Corregir la captura de un folio pendiente es legítimo —la transición
 * PENDIENTE_DE_FIRMA -> BORRADOR existe en el esquema justo para "se detecta
 * un error antes de firmar"—, pero no puede pasar en silencio: quien reabre la
 * captura queda asentado en el historial de estado, y al reenviarlo a firma
 * `enviarAFirma` vuelve a correr el arqueo sobre las cifras nuevas. Ése es el
 * uso del id de usuario en la captura: el papel no tiene casilla para él, el
 * historial sí.
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

/**
 * Captura o corrige la Parte I del RCI-01. Una sola fila por folio: se inserta
 * la primera vez y se actualiza en las siguientes, porque el recibo ES el
 * folio y no una lista de versiones.
 *
 * Si el documento ya está firmado o cancelado, el disparador
 * `recibo_caja_rci01_congelado` lo impide y pide emitir un complementario.
 */
export async function capturarReciboCaja(
  documentoId: number,
  datos: EntradaReciboCaja,
  usuario: number,
): Promise<ReciboCaja> {
  const id = esquemaId.parse(documentoId);
  const usuarioId = esquemaId.parse(usuario);
  const recibo = esquemaReciboCaja.parse(datos);

  return withTransaction(async (cliente) => {
    await reabrirSiEstabaEnFirma(cliente, id, usuarioId);

    const { rows } = await cliente.query<FilaReciboCaja>(
      `INSERT INTO traza.recibo_caja_rci01
         (documento_id, vendedor_empleado_id, vendedor_id_tipo, vendedor_id_numero,
          cliente_nombre, vehiculo_descripcion, vin, fecha_hora_cobro,
          documento_venta_id, folio_venta_texto, concepto_codigo, concepto_otro,
          importe_total)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (documento_id) DO UPDATE
          SET vendedor_empleado_id = EXCLUDED.vendedor_empleado_id,
              vendedor_id_tipo     = EXCLUDED.vendedor_id_tipo,
              vendedor_id_numero   = EXCLUDED.vendedor_id_numero,
              cliente_nombre       = EXCLUDED.cliente_nombre,
              vehiculo_descripcion = EXCLUDED.vehiculo_descripcion,
              vin                  = EXCLUDED.vin,
              fecha_hora_cobro     = EXCLUDED.fecha_hora_cobro,
              documento_venta_id   = EXCLUDED.documento_venta_id,
              folio_venta_texto    = EXCLUDED.folio_venta_texto,
              concepto_codigo      = EXCLUDED.concepto_codigo,
              concepto_otro        = EXCLUDED.concepto_otro,
              importe_total        = EXCLUDED.importe_total
       RETURNING ${COLUMNAS_RECIBO_CAJA}`,
      [
        id,
        recibo.vendedorEmpleadoId,
        recibo.vendedorIdTipo,
        recibo.vendedorIdNumero,
        recibo.clienteNombre,
        recibo.vehiculoDescripcion,
        recibo.vin,
        recibo.fechaHoraCobro,
        recibo.documentoVentaId,
        recibo.folioVentaTexto,
        recibo.conceptoCodigo,
        recibo.conceptoOtro,
        recibo.importeTotal,
      ],
    );
    return filaAReciboCaja(rows[0]);
  });
}

export async function obtenerReciboCaja(documentoId: number): Promise<ReciboCaja | null> {
  const id = esquemaId.parse(documentoId);
  const { rows } = await query<FilaReciboCaja>(
    `SELECT ${COLUMNAS_RECIBO_CAJA}
       FROM traza.recibo_caja_rci01
      WHERE documento_id = $1`,
    [id],
  );
  return rows[0] ? filaAReciboCaja(rows[0]) : null;
}

// ===== ARQUEO: DESGLOSE DE DENOMINACIONES =====

export const esquemaDenominacion = z.object({
  /** Valor del billete o la moneda: "500.00", "0.50". */
  denominacion: esquemaImporteMonetario,
  cantidad: z
    .number()
    .int("La cantidad de piezas es un número entero")
    .positive("Un renglón del arqueo cuenta al menos una pieza"),
});

export type EntradaDenominacion = z.input<typeof esquemaDenominacion>;

/**
 * El desglose completo. Una denominación no puede repetirse: en el papel es un
 * renglón por corte de billete, y la llave primaria de la tabla dice lo mismo.
 * Se comprueba aquí para poder nombrar la denominación repetida en vez de
 * devolver un 23505 sin contexto.
 */
export const esquemaDesgloseDenominaciones = z
  .array(esquemaDenominacion)
  .max(40, "El arqueo no lleva tantos renglones; revisa el desglose")
  .superRefine((filas, ctx) => {
    const vistas = new Set<string>();
    filas.forEach((fila, indice) => {
      if (vistas.has(fila.denominacion)) {
        ctx.addIssue({
          code: "custom",
          path: [indice, "denominacion"],
          message: `La denominación ${fila.denominacion} aparece dos veces; súmala en un solo renglón`,
        });
      }
      vistas.add(fila.denominacion);
    });
  });

export type RenglonArqueo = {
  denominacion: string;
  cantidad: number;
  /** Columna GENERATED: la multiplicación la hace la base, no la pantalla. */
  subtotal: string;
};

export type DesgloseArqueo = {
  documentoId: number;
  renglones: RenglonArqueo[];
  /** Suma del desglose. Si cuadra o no contra el importe lo dice `validarArqueo`. */
  total: string;
};

type FilaDenominacion = {
  denominacion: string;
  cantidad: number;
  subtotal: string;
};

function aDesglose(documentoId: number, filas: FilaDenominacion[]): DesgloseArqueo {
  // La suma se hace en centavos enteros: sumar numeric como double perdería
  // los centavos que este desglose existe para cuadrar.
  const total = filas.reduce((acumulado, fila) => acumulado + (aCentavos(fila.subtotal) ?? 0n), 0n);

  return {
    documentoId,
    renglones: filas.map((fila) => ({
      denominacion: fila.denominacion,
      cantidad: fila.cantidad,
      subtotal: fila.subtotal,
    })),
    total: deCentavos(total),
  };
}

const COLUMNAS_DENOMINACION = `denominacion::text AS denominacion, cantidad, subtotal::text AS subtotal`;

/**
 * Reemplaza EN BLOQUE el desglose del arqueo.
 *
 * Borrar e insertar ocurre dentro de una transacción porque un arqueo a medias
 * —los billetes viejos borrados y los nuevos a medio escribir— es una caja que
 * no cuadra con nada y que nadie podría explicar. O queda el desglose entero
 * nuevo, o queda el anterior intacto.
 *
 * Una lista vacía es válida: sirve para limpiar un desglose mal capturado y
 * volver a contarlo. Lo que no se podrá es enviar el folio a firma, porque el
 * arqueo no sumará el importe declarado.
 */
export async function registrarDenominaciones(
  documentoId: number,
  desglose: EntradaDenominacion[],
): Promise<DesgloseArqueo> {
  const id = esquemaId.parse(documentoId);
  const renglones = esquemaDesgloseDenominaciones.parse(desglose);

  return withTransaction(async (cliente) => {
    await cliente.query(`DELETE FROM traza.denominacion_rci01 WHERE documento_id = $1`, [id]);

    if (renglones.length > 0) {
      await cliente.query(
        `INSERT INTO traza.denominacion_rci01 (documento_id, denominacion, cantidad)
         SELECT $1, d.denominacion, d.cantidad
           FROM unnest($2::numeric[], $3::integer[]) AS d(denominacion, cantidad)`,
        [
          id,
          renglones.map((renglon) => renglon.denominacion),
          renglones.map((renglon) => renglon.cantidad),
        ],
      );
    }

    // Se relee ya guardado: `subtotal` es columna generada y el orden del
    // arqueo es el del conteo, del billete mayor al menor.
    const { rows } = await cliente.query<FilaDenominacion>(
      `SELECT ${COLUMNAS_DENOMINACION}
         FROM traza.denominacion_rci01
        WHERE documento_id = $1
        ORDER BY denominacion DESC`,
      [id],
    );
    return aDesglose(id, rows);
  });
}

export async function obtenerDenominaciones(documentoId: number): Promise<DesgloseArqueo> {
  const id = esquemaId.parse(documentoId);
  const { rows } = await query<FilaDenominacion>(
    `SELECT ${COLUMNAS_DENOMINACION}
       FROM traza.denominacion_rci01
      WHERE documento_id = $1
      ORDER BY denominacion DESC`,
    [id],
  );
  return aDesglose(id, rows);
}

/**
 * Comprueba que el desglose sume exactamente el importe declarado.
 *
 * Si no cuadra, `validar_arqueo_rci01` levanta su P0001 con las dos cifras y
 * ese error DEBE propagarse: sale como 409 con el mensaje del manual, que es
 * justo lo que quien está contando el dinero necesita leer. No se atrapa.
 *
 * `enviarAFirma` corre esta misma función dentro de la transacción que cambia
 * el estado; ésta se expone aparte para que la pantalla pueda avisar del
 * descuadre mientras se captura, sin intentar el envío.
 */
export async function validarArqueo(documentoId: number): Promise<void> {
  const id = esquemaId.parse(documentoId);
  await query(`SELECT traza.validar_arqueo_rci01($1)`, [id]);
}

// ===== CACM-RCI-04 — RECIBO DE INGRESO POR SERVICIO =====

/** Orden del papel: cliente, vehículo, placas, orden de servicio, cobro. */
export const esquemaIngresoServicio = z.object({
  clienteNombre: z.string().trim().min(3, "Captura el nombre del cliente").max(160),
  vehiculoDescripcion: textoOpcional(200),
  placas: textoOpcional(20),
  ordenServicio: z
    .string()
    .trim()
    .min(1, "Captura el número de orden de servicio")
    .max(40),
  fechaHoraCobro: esquemaFechaHoraIso,
  descripcionServicio: z
    .string()
    .trim()
    .min(5, "Describe el servicio que se cobra")
    .max(1000),
  /** Asesor o cajero de servicio que recibió el dinero. */
  cobradorEmpleadoId: esquemaId,
  /**
   * Sólo las formas marcadas `afecta_caja_fisica` engordan el arqueo del
   * corte; el catálogo lo decide, no este módulo.
   */
  formaPago: esquemaCodigoCatalogo,
  importeTotal: esquemaImporteMonetario,
});

export type EntradaIngresoServicio = z.input<typeof esquemaIngresoServicio>;

export type IngresoServicio = {
  documentoId: number;
  clienteNombre: string;
  vehiculoDescripcion: string | null;
  placas: string | null;
  ordenServicio: string;
  fechaHoraCobro: string;
  descripcionServicio: string;
  cobradorEmpleadoId: number;
  formaPago: string;
  importeTotal: string;
};

type FilaIngresoServicio = {
  documento_id: string | number;
  cliente_nombre: string;
  vehiculo_descripcion: string | null;
  placas: string | null;
  orden_servicio: string;
  fecha_hora_cobro: Date | string;
  descripcion_servicio: string;
  cobrador_empleado_id: string | number;
  forma_pago: string;
  importe_total: string;
};

const COLUMNAS_INGRESO_SERVICIO = `documento_id, cliente_nombre, vehiculo_descripcion, placas,
         orden_servicio, fecha_hora_cobro, descripcion_servicio,
         cobrador_empleado_id, forma_pago, importe_total`;

function filaAIngresoServicio(fila: FilaIngresoServicio): IngresoServicio {
  return {
    documentoId: aNumero(fila.documento_id),
    clienteNombre: fila.cliente_nombre,
    vehiculoDescripcion: fila.vehiculo_descripcion,
    placas: fila.placas,
    ordenServicio: fila.orden_servicio,
    fechaHoraCobro: aIso(fila.fecha_hora_cobro),
    descripcionServicio: fila.descripcion_servicio,
    cobradorEmpleadoId: aNumero(fila.cobrador_empleado_id),
    formaPago: fila.forma_pago,
    importeTotal: fila.importe_total,
  };
}

/**
 * Captura o corrige el RCI-04. Mismo trato que el recibo de caja: una fila por
 * folio, y corregir un folio ya enviado a firma lo devuelve a BORRADOR a
 * nombre de quien lo corrige.
 *
 * El RCI-04 no lleva desglose de denominaciones —el taller cobra también con
 * tarjeta o transferencia— pero sí lleva la misma transferencia de custodia,
 * porque el efectivo que sí entró tiene que llegar al Custodio Financiero.
 */
export async function capturarIngresoServicio(
  documentoId: number,
  datos: EntradaIngresoServicio,
  usuario: number,
): Promise<IngresoServicio> {
  const id = esquemaId.parse(documentoId);
  const usuarioId = esquemaId.parse(usuario);
  const servicio = esquemaIngresoServicio.parse(datos);

  return withTransaction(async (cliente) => {
    await reabrirSiEstabaEnFirma(cliente, id, usuarioId);

    const { rows } = await cliente.query<FilaIngresoServicio>(
      `INSERT INTO traza.ingreso_servicio_rci04
         (documento_id, cliente_nombre, vehiculo_descripcion, placas, orden_servicio,
          fecha_hora_cobro, descripcion_servicio, cobrador_empleado_id, forma_pago,
          importe_total)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (documento_id) DO UPDATE
          SET cliente_nombre       = EXCLUDED.cliente_nombre,
              vehiculo_descripcion = EXCLUDED.vehiculo_descripcion,
              placas               = EXCLUDED.placas,
              orden_servicio       = EXCLUDED.orden_servicio,
              fecha_hora_cobro     = EXCLUDED.fecha_hora_cobro,
              descripcion_servicio = EXCLUDED.descripcion_servicio,
              cobrador_empleado_id = EXCLUDED.cobrador_empleado_id,
              forma_pago           = EXCLUDED.forma_pago,
              importe_total        = EXCLUDED.importe_total
       RETURNING ${COLUMNAS_INGRESO_SERVICIO}`,
      [
        id,
        servicio.clienteNombre,
        servicio.vehiculoDescripcion,
        servicio.placas,
        servicio.ordenServicio,
        servicio.fechaHoraCobro,
        servicio.descripcionServicio,
        servicio.cobradorEmpleadoId,
        servicio.formaPago,
        servicio.importeTotal,
      ],
    );
    return filaAIngresoServicio(rows[0]);
  });
}

export async function obtenerIngresoServicio(
  documentoId: number,
): Promise<IngresoServicio | null> {
  const id = esquemaId.parse(documentoId);
  const { rows } = await query<FilaIngresoServicio>(
    `SELECT ${COLUMNAS_INGRESO_SERVICIO}
       FROM traza.ingreso_servicio_rci04
      WHERE documento_id = $1`,
    [id],
  );
  return rows[0] ? filaAIngresoServicio(rows[0]) : null;
}

// ===== CUSTODIA DEL EFECTIVO =====

export const esquemaFiltroCustodia = z.object({
  sucursalId: esquemaId.optional(),
  /**
   * Umbral en horas a partir del cual un cobro sin custodia confirmada se
   * marca como vencido. NO filtra: si sólo devolviera lo vencido, la marca no
   * distinguiría nada y quien vigila la caja perdería de vista el dinero que
   * está a punto de rebasar el umbral.
   */
  horasMinimas: z.number().positive().max(24 * 90).default(HORAS_ALERTA_CUSTODIA),
});

export type FiltroCustodia = z.input<typeof esquemaFiltroCustodia>;

export type CustodiaPendiente = {
  documentoId: number;
  folio: string;
  folioCompleto: string;
  tipoCodigo: TipoRci;
  sucursalId: number;
  sucursalClave: string;
  estado: EstadoDocumentoFinanciero | null;
  /** Nulos mientras el folio esté emitido pero sin capturar. */
  importe: string | null;
  fechaHoraCobro: string | null;
  horasEnTransito: number | null;
  custodiaConfirmada: boolean;
  /** Verdadero cuando el dinero lleva demasiado tiempo sin que nadie lo reciba. */
  vencida: boolean;
  /** Cómo debe leerse en pantalla mientras el custodio no firme. */
  etiqueta: string;
};

type FilaCustodia = {
  documento_id: string | number;
  folio: string;
  folio_completo: string;
  tipo_codigo: string;
  sucursal_id: string | number;
  sucursal_clave: string;
  estado: string | null;
  importe: string | null;
  fecha_hora_cobro: Date | string | null;
  custodia_confirmada: boolean;
  horas_en_transito: string | number | null;
};

/**
 * Dinero declarado como entregado que ningún custodio ha confirmado todavía.
 *
 * Mientras un folio viva en esta lista NO es dinero resguardado por la
 * empresa: sigue siendo responsabilidad de quien lo entregó, y así lo dice
 * `etiqueta`. El umbral sólo señala; no detiene la operación ni impide firmar,
 * porque el manual quiere que el retraso sea visible, no que bloquee la caja.
 */
export async function custodiaPendiente(
  filtro: FiltroCustodia = {},
): Promise<CustodiaPendiente[]> {
  const { sucursalId, horasMinimas } = esquemaFiltroCustodia.parse(filtro);

  const { rows } = await query<FilaCustodia>(
    `SELECT c.documento_id,
            c.folio,
            c.folio_completo,
            c.tipo_codigo,
            c.sucursal_id,
            c.sucursal_clave,
            c.estado,
            c.importe,
            c.fecha_hora_cobro,
            c.custodia_confirmada,
            c.horas_en_transito
       FROM traza.v_custodia_pendiente c
      WHERE ($1::bigint IS NULL OR c.sucursal_id = $1)
      ORDER BY c.horas_en_transito DESC NULLS LAST, c.documento_id`,
    [sucursalId ?? null],
  );

  return rows.map((fila) => {
    const horasEnTransito =
      fila.horas_en_transito === null ? null : Number(fila.horas_en_transito);

    return {
      documentoId: aNumero(fila.documento_id),
      folio: fila.folio,
      folioCompleto: fila.folio_completo,
      tipoCodigo: fila.tipo_codigo as TipoRci,
      sucursalId: aNumero(fila.sucursal_id),
      sucursalClave: fila.sucursal_clave,
      estado: fila.estado as EstadoDocumentoFinanciero | null,
      importe: fila.importe,
      fechaHoraCobro: aIsoOpcional(fila.fecha_hora_cobro),
      horasEnTransito,
      custodiaConfirmada: fila.custodia_confirmada,
      vencida: custodiaEstaVencida(horasEnTransito, horasMinimas),
      etiqueta: etiquetaCustodia(fila.custodia_confirmada),
    };
  });
}

export const esquemaConfirmarCustodia = z.object({
  documentoId: esquemaId,
  /** Custodio Financiero que recibe el efectivo. Es SU PIN el que se coteja. */
  custodio: esquemaId,
  pin: esquemaPinFirma,
  /** Huella del recibo tal como se le mostró al custodio al recibirlo. */
  hashContenido: esquemaHashSha256,
  origenSesion: z.string().trim().max(200).nullish(),
});

export type EntradaConfirmarCustodia = z.input<typeof esquemaConfirmarCustodia>;

/**
 * Firma del rol RECIBIO_CUSTODIO: el acto por el que el efectivo deja de estar
 * en tránsito y pasa a resguardo de la empresa.
 *
 * POR QUÉ SE EXIGE EL PIN DEL PROPIO CUSTODIO Y NO BASTA SU SESIÓN:
 *
 *  1. La sesión acredita quién tiene abierta la pantalla, y en el mostrador
 *     esa persona es casi siempre el vendedor que ENTREGA el dinero. Si la
 *     sesión bastara, quien entrega podría dar por recibida una custodia que
 *     nadie aceptó, y el folio saldría de esta lista sin que ningún custodio
 *     hubiera tocado el efectivo. La transferencia de responsabilidad quedaría
 *     documentada como un hecho que no ocurrió.
 *  2. Recibir la custodia no es guardar un formulario: es hacerse responsable
 *     de un dinero. El PIN es el equivalente digital de la firma en el papel,
 *     un gesto deliberado y personal, distinto de "estar operando el sistema".
 *  3. La comprobación no vive aquí sino en `verificar_pin`, dentro de la
 *     función SQL, precisamente para que ninguna ruta que la olvidara pudiera
 *     saltársela. Esta capa sólo transporta el PIN hasta ella.
 *
 * Que quien entrega y quien recibe sean personas distintas lo garantiza el
 * índice único parcial (documento_id, usuario_id) de las firmas, y que el rol
 * corresponda al formato lo comprueba `validar_firma_admisible`: RECIBIO_CUSTODIO
 * sólo está declarado para el RCI-01 y el RCI-04.
 *
 * Devuelve el estado resultante: FIRMADO si ésta era la última firma
 * obligatoria del folio, PENDIENTE_DE_FIRMA si aún falta alguna.
 */
export async function confirmarCustodia(
  entrada: EntradaConfirmarCustodia,
): Promise<EstadoDocumentoFinanciero> {
  const datos = esquemaConfirmarCustodia.parse(entrada);

  return firmarComoInterno({
    documentoId: datos.documentoId,
    rol: "RECIBIO_CUSTODIO",
    usuario: datos.custodio,
    pin: datos.pin,
    hashContenido: datos.hashContenido,
    origenSesion: datos.origenSesion,
  });
}

import "server-only";

import type { PoolClient } from "pg";
import { z } from "zod";

import { query, withTransaction } from "@/lib/db";
import { aCentavos, deCentavos, utilidadConsigna } from "@/lib/finanzas/calculos";
import { ETIQUETA_RESGUARDO_TERCEROS } from "@/lib/finanzas/formato";
import {
  esquemaFechaIso,
  esquemaId,
  esquemaIdentificacion,
  esquemaImporteConSigno,
  esquemaImporteMonetario,
  esquemaImporteNoNegativo,
  esquemaNombrePersona,
  type EstadoDocumentoFinanciero,
} from "@/lib/finanzas/tipos";
import { MAXIMO_KILOMETRAJE_UNIDAD } from "@/lib/unidad";

export const TIPOS_OPERACION_INGRESO = ["COMPRA_DIRECTA", "CONSIGNACION"] as const;

export type TipoOperacionIngreso = (typeof TIPOS_OPERACION_INGRESO)[number];

export type OrigenUnidad = "PROPIA" | "CONSIGNADA";

export const ORIGEN_A_TIPO_OPERACION: Record<OrigenUnidad, TipoOperacionIngreso> = {
  PROPIA: "COMPRA_DIRECTA",
  CONSIGNADA: "CONSIGNACION",
};

export { ETIQUETA_RESGUARDO_TERCEROS };

const ESTADOS_UNIDAD_FUERA_DE_RESGUARDO = ["ENTREGADA", "DEVUELTA_CONSIGNANTE", "BAJA"];

export const MINIMO_NOTA_AUDITORIA_AJUSTE = 20;

const esquemaCodigoCatalogo = z
  .string()
  .transform((valor) => valor.trim().toUpperCase())
  .refine((valor) => /^[A-Z0-9_]{2,40}$/.test(valor), "El código de catálogo no es válido");

const esquemaPorcentaje = z
  .string()
  .trim()
  .refine(
    (valor) => /^\d{1,3}(?:\.\d{1,2})?$/.test(valor),
    "El porcentaje se escribe con dígitos y hasta dos decimales, por ejemplo 12.5",
  )
  .refine((valor) => {
    const centesimas = aCentavos(valor);
    return centesimas !== null && centesimas > 0n && centesimas <= 10_000n;
  }, "La comisión pactada debe ser mayor que cero y no pasar de 100 por ciento")
  .transform((valor) => deCentavos(aCentavos(valor) as bigint));

const esquemaIngresoComun = z.object({
  
  expedienteId: esquemaId,
  placas: z.string().trim().max(20).nullish(),

  
  kilometraje: z.number().int().nonnegative().max(MAXIMO_KILOMETRAJE_UNIDAD).nullish(),
  ubicacionFisica: z.string().trim().max(160).nullish(),
  fechaIngreso: esquemaFechaIso,
  numLlaves: z.number().int().min(0).max(10).nullish(),
  propietarioNombre: esquemaNombrePersona,
  propietarioIdTipo: esquemaIdentificacion.shape.tipo,
  propietarioIdNumero: esquemaIdentificacion.shape.numero,
  propietarioTelefono: z
    .string()
    .trim()
    .regex(/^[0-9]{10}$/, "El teléfono son 10 dígitos, sin espacios ni guiones")
    .nullish(),
  propietarioDomicilio: z.string().trim().max(300).nullish(),
});

export const esquemaIngresoVehiculo = z.discriminatedUnion("tipoOperacion", [
  esquemaIngresoComun.extend({
    tipoOperacion: z.literal("COMPRA_DIRECTA"),
    precioCompra: esquemaImporteMonetario,
    compraFormaPago: esquemaCodigoCatalogo.nullish(),
    compraFechaPago: esquemaFechaIso.nullish(),
  }),
  esquemaIngresoComun.extend({
    tipoOperacion: z.literal("CONSIGNACION"),
    precioMinimoVenta: esquemaImporteMonetario,
    comisionMonto: esquemaImporteNoNegativo.nullish(),
    comisionPct: esquemaPorcentaje.nullish(),
    consignaFechaLimite: esquemaFechaIso.nullish(),
  }),
]);

export type EntradaIngresoVehiculo = z.input<typeof esquemaIngresoVehiculo>;

export const esquemaGastoLiquidacion = z.object({
  concepto: z.string().trim().min(3, "Describe el gasto").max(160),
  importe: esquemaImporteMonetario,
});

export type EntradaGastoLiquidacion = z.input<typeof esquemaGastoLiquidacion>;

export const esquemaLiquidacion = z.object({
  
  ingresoRci02Id: esquemaId,
  
  reciboRci01Id: esquemaId.nullish(),
  
  documentoVentaId: esquemaId.nullish(),
  consignanteNombre: esquemaNombrePersona,
  precioVentaFinal: esquemaImporteMonetario,
  montoConsignante: esquemaImporteNoNegativo,
  formaIngresoTesoreria: esquemaCodigoCatalogo,
  institucionBancaria: z.string().trim().max(80).nullish(),
  cuentaBancaria: z.string().trim().max(40).nullish(),
  
  gastos: z.array(esquemaGastoLiquidacion).max(100).optional(),
});

export type EntradaLiquidacion = z.input<typeof esquemaLiquidacion>;

export const esquemaAjusteUtilidad = z.object({
  montoAjuste: esquemaImporteConSigno,
  notaAuditoria: z
    .string()
    .trim()
    .min(
      MINIMO_NOTA_AUDITORIA_AJUSTE,
      "Explica el ajuste: la nota de auditoría es lo único que lo justifica",
    )
    .max(1000),
});

export type EntradaAjusteUtilidad = z.input<typeof esquemaAjusteUtilidad>;

export const esquemaPrevisualizacionUtilidad = z.object({
  
  ingresoRci02Id: esquemaId.nullish(),
  precioVenta: esquemaImporteMonetario,
  montoConsignante: esquemaImporteNoNegativo,
  gastos: z.array(esquemaGastoLiquidacion).max(100).optional(),
});

export type EntradaPrevisualizacionUtilidad = z.input<typeof esquemaPrevisualizacionUtilidad>;

export type DatosPrecargadosExpediente = {
  expedienteId: number;
  numeroExpediente: string;
  
  origen: OrigenUnidad;
  
  tipoOperacionSugerido: TipoOperacionIngreso;
  vin: string;
  marca: string;
  modelo: string;
  anio: number;
  color: string | null;
  numMotor: string | null;
  
  kilometrajeIngreso: number | null;
  
  yaTieneIngreso: boolean;
};

export type IngresoVehiculo = {
  documentoId: number;
  folio: string;
  estado: EstadoDocumentoFinanciero | null;
  expedienteId: number;
  numeroExpediente: string;
  origen: OrigenUnidad;
  vin: string;
  marca: string;
  modelo: string;
  anio: number;
  placas: string | null;
  kilometraje: number | null;
  ubicacionFisica: string | null;
  fechaIngreso: string;
  numLlaves: number | null;
  propietarioNombre: string;
  propietarioIdTipo: string;
  propietarioIdNumero: string;
  propietarioTelefono: string | null;
  propietarioDomicilio: string | null;
  tipoOperacion: TipoOperacionIngreso;
  precioCompra: string | null;
  compraFormaPago: string | null;
  compraFechaPago: string | null;
  precioMinimoVenta: string | null;
  comisionMonto: string | null;
  comisionPct: string | null;
  consignaFechaLimite: string | null;
};

export type GastoLiquidacion = {
  id: number;
  concepto: string;
  importe: string;
};

export type AjusteUtilidad = {
  id: number;
  documentoId: number;
  montoAjuste: string;
  notaAuditoria: string;
  autorizadoPor: number;
  autorizadoPorNombre: string;
  creadoEn: string;
};

export type LiquidacionConsigna = {
  documentoId: number;
  folio: string;
  estado: EstadoDocumentoFinanciero | null;
  ingresoRci02Id: number;
  ingresoFolio: string;
  vin: string;
  reciboRci01Id: number | null;
  documentoVentaId: number | null;
  consignanteNombre: string;
  precioVentaFinal: string;
  montoConsignante: string;
  
  gastosTotal: string;
  
  utilidadNeta: string;
  
  utilidadNetaAjustada: string;
  formaIngresoTesoreria: string;
  institucionBancaria: string | null;
  cuentaBancaria: string | null;
  gastos: GastoLiquidacion[];
  ajustes: AjusteUtilidad[];
};

export type PrevisualizacionUtilidad = {
  precioVenta: string;
  montoConsignante: string;
  gastosTotal: string;
  
  utilidadNeta: string;
  esNegativa: boolean;
  
  precioMinimoPactado: string | null;
  comisionPactadaMonto: string | null;
  comisionPactadaPct: string | null;
  
  bajoPrecioMinimo: boolean;
};

export type UnidadEnConsignacion = {
  expedienteId: number;
  numeroExpediente: string;
  vin: string;
  marca: string;
  modelo: string;
  anio: number;
  color: string | null;
  estadoUnidad: string | null;
  ubicacionFisica: string | null;
  ingresoDocumentoId: number | null;
  ingresoFolio: string | null;
  ingresoEstado: EstadoDocumentoFinanciero | null;
  precioMinimoVenta: string | null;
  comisionMonto: string | null;
  comisionPct: string | null;
  consignaFechaLimite: string | null;
  
  liquidada: boolean;
  liquidacionDocumentoId: number | null;
  
  cuentaEnInventarioPropio: false;
  etiquetaInventario: string;
};

function aIso(valor: Date | string): string {
  return (valor instanceof Date ? valor : new Date(valor)).toISOString();
}

function sumarImportes(importes: string[]): bigint {
  return importes.reduce((total, importe) => total + (aCentavos(importe) ?? 0n), 0n);
}

export async function datosPrecargadosDeExpediente(
  expedienteId: number,
): Promise<DatosPrecargadosExpediente | null> {
  const id = esquemaId.parse(expedienteId);

  const { rows } = await query<{
    expediente_id: number;
    numero_expediente: string;
    origen: OrigenUnidad;
    vin: string;
    marca: string;
    modelo: string;
    anio: number;
    color: string | null;
    num_motor: string | null;
    kilometraje_ingreso: number | null;
    ya_tiene_ingreso: boolean;
  }>(
    `SELECT e.id::int AS expediente_id,
            e.anio::text || '-' || lpad(e.consecutivo::text, 3, '0') AS numero_expediente,
            e.origen,
            e.vin,
            ma.nombre AS marca,
            mo.nombre AS modelo,
            u.anio_modelo AS anio,
            u.color,
            u.num_motor,
            u.kilometraje_ingreso,
            EXISTS (SELECT 1 FROM traza.ingreso_vehiculo_rci02 i
                     WHERE i.expediente_id = e.id) AS ya_tiene_ingreso
       FROM traza.expediente e
       JOIN traza.unidad u ON u.vin = e.vin
       JOIN traza.modelo mo ON mo.id = u.modelo_id
       JOIN traza.marca ma ON ma.id = mo.marca_id
      WHERE e.id = $1`,
    [id],
  );

  const fila = rows[0];
  if (!fila) return null;

  return {
    expedienteId: fila.expediente_id,
    numeroExpediente: fila.numero_expediente,
    origen: fila.origen,
    tipoOperacionSugerido: ORIGEN_A_TIPO_OPERACION[fila.origen],
    vin: fila.vin,
    marca: fila.marca,
    modelo: fila.modelo,
    anio: fila.anio,
    color: fila.color,
    numMotor: fila.num_motor,
    kilometrajeIngreso: fila.kilometraje_ingreso,
    yaTieneIngreso: fila.ya_tiene_ingreso,
  };
}

type FilaIngreso = {
  documento_id: number;
  folio: string;
  estado: string | null;
  expediente_id: number;
  numero_expediente: string;
  origen: OrigenUnidad;
  vin: string;
  marca: string;
  modelo: string;
  anio: number;
  placas: string | null;
  kilometraje: number | null;
  ubicacion_fisica: string | null;
  fecha_ingreso: string;
  num_llaves: number | null;
  propietario_nombre: string;
  propietario_id_tipo: string;
  propietario_id_numero: string;
  propietario_telefono: string | null;
  propietario_domicilio: string | null;
  tipo_operacion: TipoOperacionIngreso;
  precio_compra: string | null;
  compra_forma_pago: string | null;
  compra_fecha_pago: string | null;
  precio_minimo_venta: string | null;
  comision_monto: string | null;
  comision_pct: string | null;
  consigna_fecha_limite: string | null;
};

const SELECT_INGRESO_RCI02 = `
  SELECT i.documento_id::int AS documento_id,
         d.folio,
         d.estado,
         i.expediente_id::int AS expediente_id,
         e.anio::text || '-' || lpad(e.consecutivo::text, 3, '0') AS numero_expediente,
         e.origen,
         e.vin,
         ma.nombre AS marca,
         mo.nombre AS modelo,
         u.anio_modelo AS anio,
         i.placas,
         i.kilometraje,
         i.ubicacion_fisica,
         i.fecha_ingreso::text AS fecha_ingreso,
         i.num_llaves,
         i.propietario_nombre,
         i.propietario_id_tipo,
         i.propietario_id_numero,
         i.propietario_telefono,
         i.propietario_domicilio,
         i.tipo_operacion,
         i.precio_compra::text AS precio_compra,
         i.compra_forma_pago,
         i.compra_fecha_pago::text AS compra_fecha_pago,
         i.precio_minimo_venta::text AS precio_minimo_venta,
         i.comision_monto::text AS comision_monto,
         i.comision_pct::text AS comision_pct,
         i.consigna_fecha_limite::text AS consigna_fecha_limite
    FROM traza.ingreso_vehiculo_rci02 i
    JOIN traza.v_documento_financiero d ON d.id = i.documento_id
    JOIN traza.expediente e ON e.id = i.expediente_id
    JOIN traza.unidad u ON u.vin = e.vin
    JOIN traza.modelo mo ON mo.id = u.modelo_id
    JOIN traza.marca ma ON ma.id = mo.marca_id`;

function filaAIngreso(fila: FilaIngreso): IngresoVehiculo {
  return {
    documentoId: fila.documento_id,
    folio: fila.folio,
    estado: fila.estado as EstadoDocumentoFinanciero | null,
    expedienteId: fila.expediente_id,
    numeroExpediente: fila.numero_expediente,
    origen: fila.origen,
    vin: fila.vin,
    marca: fila.marca,
    modelo: fila.modelo,
    anio: fila.anio,
    placas: fila.placas,
    kilometraje: fila.kilometraje,
    ubicacionFisica: fila.ubicacion_fisica,
    fechaIngreso: fila.fecha_ingreso,
    numLlaves: fila.num_llaves,
    propietarioNombre: fila.propietario_nombre,
    propietarioIdTipo: fila.propietario_id_tipo,
    propietarioIdNumero: fila.propietario_id_numero,
    propietarioTelefono: fila.propietario_telefono,
    propietarioDomicilio: fila.propietario_domicilio,
    tipoOperacion: fila.tipo_operacion,
    precioCompra: fila.precio_compra,
    compraFormaPago: fila.compra_forma_pago,
    compraFechaPago: fila.compra_fecha_pago,
    precioMinimoVenta: fila.precio_minimo_venta,
    comisionMonto: fila.comision_monto,
    comisionPct: fila.comision_pct,
    consignaFechaLimite: fila.consigna_fecha_limite,
  };
}

export async function capturarIngresoVehiculo(
  documentoId: number,
  datos: EntradaIngresoVehiculo,
  usuario: number,
): Promise<IngresoVehiculo> {
  const id = esquemaId.parse(documentoId);
  const entrada = esquemaIngresoVehiculo.parse(datos);

  
  
  esquemaId.parse(usuario);

  const esCompra = entrada.tipoOperacion === "COMPRA_DIRECTA";

  return withTransaction(async (cliente) => {
    await cliente.query(
      `INSERT INTO traza.ingreso_vehiculo_rci02 (
         documento_id, expediente_id, placas, kilometraje, ubicacion_fisica,
         fecha_ingreso, num_llaves, propietario_nombre, propietario_id_tipo,
         propietario_id_numero, propietario_telefono, propietario_domicilio,
         tipo_operacion, precio_compra, compra_forma_pago, compra_fecha_pago,
         precio_minimo_venta, comision_monto, comision_pct, consigna_fecha_limite)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
               $16, $17, $18, $19, $20)
       ON CONFLICT (documento_id) DO UPDATE SET
         expediente_id         = EXCLUDED.expediente_id,
         placas                = EXCLUDED.placas,
         kilometraje           = EXCLUDED.kilometraje,
         ubicacion_fisica      = EXCLUDED.ubicacion_fisica,
         fecha_ingreso         = EXCLUDED.fecha_ingreso,
         num_llaves            = EXCLUDED.num_llaves,
         propietario_nombre    = EXCLUDED.propietario_nombre,
         propietario_id_tipo   = EXCLUDED.propietario_id_tipo,
         propietario_id_numero = EXCLUDED.propietario_id_numero,
         propietario_telefono  = EXCLUDED.propietario_telefono,
         propietario_domicilio = EXCLUDED.propietario_domicilio,
         tipo_operacion        = EXCLUDED.tipo_operacion,
         precio_compra         = EXCLUDED.precio_compra,
         compra_forma_pago     = EXCLUDED.compra_forma_pago,
         compra_fecha_pago     = EXCLUDED.compra_fecha_pago,
         precio_minimo_venta   = EXCLUDED.precio_minimo_venta,
         comision_monto        = EXCLUDED.comision_monto,
         comision_pct          = EXCLUDED.comision_pct,
         consigna_fecha_limite = EXCLUDED.consigna_fecha_limite`,
      [
        id,
        entrada.expedienteId,
        entrada.placas ?? null,
        entrada.kilometraje ?? null,
        entrada.ubicacionFisica ?? null,
        entrada.fechaIngreso,
        entrada.numLlaves ?? null,
        entrada.propietarioNombre,
        entrada.propietarioIdTipo,
        entrada.propietarioIdNumero,
        entrada.propietarioTelefono ?? null,
        entrada.propietarioDomicilio ?? null,
        entrada.tipoOperacion,
        esCompra ? entrada.precioCompra : null,
        esCompra ? entrada.compraFormaPago ?? null : null,
        esCompra ? entrada.compraFechaPago ?? null : null,
        esCompra ? null : entrada.precioMinimoVenta,
        esCompra ? null : entrada.comisionMonto ?? null,
        esCompra ? null : entrada.comisionPct ?? null,
        esCompra ? null : entrada.consignaFechaLimite ?? null,
      ],
    );

    const { rows } = await cliente.query<FilaIngreso>(
      `${SELECT_INGRESO_RCI02} WHERE i.documento_id = $1`,
      [id],
    );
    return filaAIngreso(rows[0]);
  });
}

export async function obtenerIngresoVehiculo(
  documentoId: number,
): Promise<IngresoVehiculo | null> {
  const id = esquemaId.parse(documentoId);
  const { rows } = await query<FilaIngreso>(`${SELECT_INGRESO_RCI02} WHERE i.documento_id = $1`, [
    id,
  ]);
  return rows[0] ? filaAIngreso(rows[0]) : null;
}

type FilaLiquidacion = {
  documento_id: number;
  folio: string;
  estado: string | null;
  ingreso_rci02_id: number;
  ingreso_folio: string;
  vin: string;
  recibo_rci01_id: number | null;
  documento_venta_id: number | null;
  consignante_nombre: string;
  precio_venta_final: string;
  monto_consignante: string;
  gastos_total: string;
  utilidad_neta: string;
  forma_ingreso_tesoreria: string;
  institucion_bancaria: string | null;
  cuenta_bancaria: string | null;
};

const SELECT_LIQUIDACION_RCI03 = `
  SELECT l.documento_id::int AS documento_id,
         d.folio,
         d.estado,
         l.ingreso_rci02_id::int AS ingreso_rci02_id,
         di.folio AS ingreso_folio,
         e.vin,
         l.recibo_rci01_id::int AS recibo_rci01_id,
         l.documento_venta_id::int AS documento_venta_id,
         l.consignante_nombre,
         l.precio_venta_final::text AS precio_venta_final,
         l.monto_consignante::text AS monto_consignante,
         l.gastos_total::text AS gastos_total,
         l.utilidad_neta::text AS utilidad_neta,
         l.forma_ingreso_tesoreria,
         l.institucion_bancaria,
         l.cuenta_bancaria
    FROM traza.liquidacion_consigna_rci03 l
    JOIN traza.v_documento_financiero d ON d.id = l.documento_id
    JOIN traza.ingreso_vehiculo_rci02 i ON i.documento_id = l.ingreso_rci02_id
    JOIN traza.v_documento_financiero di ON di.id = i.documento_id
    JOIN traza.expediente e ON e.id = i.expediente_id`;

const SELECT_GASTOS_RCI03 = `
  SELECT g.id::int AS id, g.concepto, g.importe::text AS importe
    FROM traza.gasto_liquidacion_rci03 g
   WHERE g.documento_id = $1
   ORDER BY g.id`;

const SELECT_AJUSTES_RCI03 = `
  SELECT a.id::int AS id,
         a.documento_id::int AS documento_id,
         a.monto_ajuste::text AS monto_ajuste,
         a.nota_auditoria,
         a.autorizado_por::int AS autorizado_por,
         u.nombre AS autorizado_por_nombre,
         a.creado_en
    FROM traza.ajuste_utilidad_rci03 a
    JOIN traza.usuario u ON u.id = a.autorizado_por
   WHERE a.documento_id = $1
   ORDER BY a.creado_en, a.id`;

type FilaAjuste = {
  id: number;
  documento_id: number;
  monto_ajuste: string;
  nota_auditoria: string;
  autorizado_por: number;
  autorizado_por_nombre: string;
  creado_en: Date | string;
};

function filaAAjuste(fila: FilaAjuste): AjusteUtilidad {
  return {
    id: fila.id,
    documentoId: fila.documento_id,
    montoAjuste: fila.monto_ajuste,
    notaAuditoria: fila.nota_auditoria,
    autorizadoPor: fila.autorizado_por,
    autorizadoPorNombre: fila.autorizado_por_nombre,
    creadoEn: aIso(fila.creado_en),
  };
}

async function leerLiquidacion(
  cliente: PoolClient,
  documentoId: number,
): Promise<LiquidacionConsigna | null> {
  const cabecera = await cliente.query<FilaLiquidacion>(
    `${SELECT_LIQUIDACION_RCI03} WHERE l.documento_id = $1`,
    [documentoId],
  );
  const fila = cabecera.rows[0];
  if (!fila) return null;

  const [gastos, ajustes] = await Promise.all([
    cliente.query<{ id: number; concepto: string; importe: string }>(SELECT_GASTOS_RCI03, [
      documentoId,
    ]),
    cliente.query<FilaAjuste>(SELECT_AJUSTES_RCI03, [documentoId]),
  ]);

  const listaAjustes = ajustes.rows.map(filaAAjuste);
  const neta = aCentavos(fila.utilidad_neta) ?? 0n;

  return {
    documentoId: fila.documento_id,
    folio: fila.folio,
    estado: fila.estado as EstadoDocumentoFinanciero | null,
    ingresoRci02Id: fila.ingreso_rci02_id,
    ingresoFolio: fila.ingreso_folio,
    vin: fila.vin,
    reciboRci01Id: fila.recibo_rci01_id,
    documentoVentaId: fila.documento_venta_id,
    consignanteNombre: fila.consignante_nombre,
    precioVentaFinal: fila.precio_venta_final,
    montoConsignante: fila.monto_consignante,
    gastosTotal: fila.gastos_total,
    utilidadNeta: fila.utilidad_neta,
    utilidadNetaAjustada: deCentavos(
      neta + sumarImportes(listaAjustes.map((ajuste) => ajuste.montoAjuste)),
    ),
    formaIngresoTesoreria: fila.forma_ingreso_tesoreria,
    institucionBancaria: fila.institucion_bancaria,
    cuentaBancaria: fila.cuenta_bancaria,
    gastos: gastos.rows.map((gasto) => ({
      id: gasto.id,
      concepto: gasto.concepto,
      importe: gasto.importe,
    })),
    ajustes: listaAjustes,
  };
}

async function reemplazarGastos(
  cliente: PoolClient,
  documentoId: number,
  gastos: { concepto: string; importe: string }[],
): Promise<void> {
  await cliente.query(`DELETE FROM traza.gasto_liquidacion_rci03 WHERE documento_id = $1`, [
    documentoId,
  ]);
  if (gastos.length === 0) return;

  await cliente.query(
    `INSERT INTO traza.gasto_liquidacion_rci03 (documento_id, concepto, importe)
     SELECT $1, g.concepto, g.importe::numeric
       FROM unnest($2::text[], $3::text[]) AS g(concepto, importe)`,
    [
      documentoId,
      gastos.map((gasto) => gasto.concepto),

      gastos.map((gasto) => gasto.importe),
    ],
  );
}

export async function capturarLiquidacion(
  documentoId: number,
  datos: EntradaLiquidacion,
  usuario: number,
): Promise<LiquidacionConsigna> {
  const id = esquemaId.parse(documentoId);
  const entrada = esquemaLiquidacion.parse(datos);

  esquemaId.parse(usuario);

  return withTransaction(async (cliente) => {
    await cliente.query(
      `INSERT INTO traza.liquidacion_consigna_rci03 (
         documento_id, ingreso_rci02_id, recibo_rci01_id, documento_venta_id,
         consignante_nombre, precio_venta_final, monto_consignante,
         forma_ingreso_tesoreria, institucion_bancaria, cuenta_bancaria)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (documento_id) DO UPDATE SET
         ingreso_rci02_id        = EXCLUDED.ingreso_rci02_id,
         recibo_rci01_id         = EXCLUDED.recibo_rci01_id,
         documento_venta_id      = EXCLUDED.documento_venta_id,
         consignante_nombre      = EXCLUDED.consignante_nombre,
         precio_venta_final      = EXCLUDED.precio_venta_final,
         monto_consignante       = EXCLUDED.monto_consignante,
         forma_ingreso_tesoreria = EXCLUDED.forma_ingreso_tesoreria,
         institucion_bancaria    = EXCLUDED.institucion_bancaria,
         cuenta_bancaria         = EXCLUDED.cuenta_bancaria`,
      [
        id,
        entrada.ingresoRci02Id,
        entrada.reciboRci01Id ?? null,
        entrada.documentoVentaId ?? null,
        entrada.consignanteNombre,
        entrada.precioVentaFinal,
        entrada.montoConsignante,
        entrada.formaIngresoTesoreria,
        entrada.institucionBancaria ?? null,
        entrada.cuentaBancaria ?? null,
      ],
    );

    if (entrada.gastos !== undefined) {
      await reemplazarGastos(cliente, id, entrada.gastos);
    }

    return (await leerLiquidacion(cliente, id)) as LiquidacionConsigna;
  });
}

export async function obtenerLiquidacion(
  documentoId: number,
): Promise<LiquidacionConsigna | null> {
  const id = esquemaId.parse(documentoId);
  return withTransaction((cliente) => leerLiquidacion(cliente, id));
}

export async function registrarGastos(
  documentoId: number,
  gastos: EntradaGastoLiquidacion[],
): Promise<LiquidacionConsigna> {
  const id = esquemaId.parse(documentoId);
  const renglones = z.array(esquemaGastoLiquidacion).max(100).parse(gastos);

  return withTransaction(async (cliente) => {
    await reemplazarGastos(cliente, id, renglones);
    const liquidacion = await leerLiquidacion(cliente, id);
    if (!liquidacion) {

      throw new Error("La liquidación indicada no existe");
    }
    return liquidacion;
  });
}

export async function registrarAjusteUtilidad(
  documentoId: number,
  datos: EntradaAjusteUtilidad,
  usuario: number,
): Promise<AjusteUtilidad> {
  const id = esquemaId.parse(documentoId);
  const entrada = esquemaAjusteUtilidad.parse(datos);
  const usuarioId = esquemaId.parse(usuario);

  const { rows } = await query<FilaAjuste>(
    `WITH nuevo AS (
       INSERT INTO traza.ajuste_utilidad_rci03
         (documento_id, monto_ajuste, nota_auditoria, autorizado_por)
       VALUES ($1, $2, $3, $4)
       RETURNING id, documento_id, monto_ajuste, nota_auditoria, autorizado_por, creado_en
     )
     SELECT n.id::int AS id,
            n.documento_id::int AS documento_id,
            n.monto_ajuste::text AS monto_ajuste,
            n.nota_auditoria,
            n.autorizado_por::int AS autorizado_por,
            u.nombre AS autorizado_por_nombre,
            n.creado_en
       FROM nuevo n
       JOIN traza.usuario u ON u.id = n.autorizado_por`,
    [id, entrada.montoAjuste, entrada.notaAuditoria, usuarioId],
  );

  return filaAAjuste(rows[0]);
}

export async function previsualizarUtilidad(
  entrada: EntradaPrevisualizacionUtilidad,
): Promise<PrevisualizacionUtilidad> {
  const datos = esquemaPrevisualizacionUtilidad.parse(entrada);

  const calculo = utilidadConsigna({
    precioVenta: datos.precioVenta,
    montoConsignante: datos.montoConsignante,
    gastos: datos.gastos ?? [],
  });
  if (!calculo) {

    throw new Error("No se pudo calcular la utilidad con los importes recibidos");
  }

  let precioMinimoPactado: string | null = null;
  let comisionPactadaMonto: string | null = null;
  let comisionPactadaPct: string | null = null;

  if (datos.ingresoRci02Id !== null && datos.ingresoRci02Id !== undefined) {
    const { rows } = await query<{
      precio_minimo_venta: string | null;
      comision_monto: string | null;
      comision_pct: string | null;
    }>(
      `SELECT i.precio_minimo_venta::text AS precio_minimo_venta,
              i.comision_monto::text AS comision_monto,
              i.comision_pct::text AS comision_pct
         FROM traza.ingreso_vehiculo_rci02 i
        WHERE i.documento_id = $1`,
      [datos.ingresoRci02Id],
    );
    precioMinimoPactado = rows[0]?.precio_minimo_venta ?? null;
    comisionPactadaMonto = rows[0]?.comision_monto ?? null;
    comisionPactadaPct = rows[0]?.comision_pct ?? null;
  }

  const minimo = precioMinimoPactado === null ? null : aCentavos(precioMinimoPactado);
  const venta = aCentavos(calculo.precioVenta);

  return {
    precioVenta: calculo.precioVenta,
    montoConsignante: calculo.montoConsignante,
    gastosTotal: calculo.gastosTotal,
    utilidadNeta: calculo.utilidadNeta,
    esNegativa: calculo.esNegativa,
    precioMinimoPactado,
    comisionPactadaMonto,
    comisionPactadaPct,
    bajoPrecioMinimo: minimo !== null && venta !== null && venta < minimo,
  };
}

type FilaUnidadConsignacion = {
  expediente_id: number;
  numero_expediente: string;
  vin: string;
  marca: string;
  modelo: string;
  anio: number;
  color: string | null;
  estado_unidad: string | null;
  ubicacion_fisica: string | null;
  ingreso_documento_id: number | null;
  ingreso_folio: string | null;
  ingreso_estado: string | null;
  precio_minimo_venta: string | null;
  comision_monto: string | null;
  comision_pct: string | null;
  consigna_fecha_limite: string | null;
  liquidacion_documento_id: number | null;
  liquidacion_estado: string | null;
};

export async function unidadesEnConsignacion(): Promise<UnidadEnConsignacion[]> {
  const { rows } = await query<FilaUnidadConsignacion>(
    `SELECT e.id::int AS expediente_id,
            e.anio::text || '-' || lpad(e.consecutivo::text, 3, '0') AS numero_expediente,
            e.vin,
            ma.nombre AS marca,
            mo.nombre AS modelo,
            u.anio_modelo AS anio,
            u.color,
            ue.estado AS estado_unidad,
            i.ubicacion_fisica,
            i.documento_id::int AS ingreso_documento_id,
            di.folio AS ingreso_folio,
            di.estado AS ingreso_estado,
            i.precio_minimo_venta::text AS precio_minimo_venta,
            i.comision_monto::text AS comision_monto,
            i.comision_pct::text AS comision_pct,
            i.consigna_fecha_limite::text AS consigna_fecha_limite,
            l.documento_id::int AS liquidacion_documento_id,
            dl.estado AS liquidacion_estado
       FROM traza.expediente e
       JOIN traza.unidad u ON u.vin = e.vin
       JOIN traza.modelo mo ON mo.id = u.modelo_id
       JOIN traza.marca ma ON ma.id = mo.marca_id
       LEFT JOIN traza.v_unidad_estado_actual ue ON ue.vin = e.vin
       LEFT JOIN traza.ingreso_vehiculo_rci02 i ON i.expediente_id = e.id
       LEFT JOIN traza.v_documento_financiero di ON di.id = i.documento_id
       LEFT JOIN traza.liquidacion_consigna_rci03 l ON l.ingreso_rci02_id = i.documento_id
       LEFT JOIN traza.v_documento_financiero dl ON dl.id = l.documento_id
      WHERE e.origen = 'CONSIGNADA'
        AND coalesce(ue.estado, '') <> ALL ($1::text[])
      ORDER BY i.consigna_fecha_limite ASC NULLS LAST, e.anio DESC, e.consecutivo DESC`,
    [ESTADOS_UNIDAD_FUERA_DE_RESGUARDO],
  );

  return rows.map((fila) => ({
    expedienteId: fila.expediente_id,
    numeroExpediente: fila.numero_expediente,
    vin: fila.vin,
    marca: fila.marca,
    modelo: fila.modelo,
    anio: fila.anio,
    color: fila.color,
    estadoUnidad: fila.estado_unidad,
    ubicacionFisica: fila.ubicacion_fisica,
    ingresoDocumentoId: fila.ingreso_documento_id,
    ingresoFolio: fila.ingreso_folio,
    ingresoEstado: fila.ingreso_estado as EstadoDocumentoFinanciero | null,
    precioMinimoVenta: fila.precio_minimo_venta,
    comisionMonto: fila.comision_monto,
    comisionPct: fila.comision_pct,
    consignaFechaLimite: fila.consigna_fecha_limite,

    liquidada: fila.liquidacion_estado === "FIRMADO",
    liquidacionDocumentoId: fila.liquidacion_documento_id,
    cuentaEnInventarioPropio: false,
    etiquetaInventario: ETIQUETA_RESGUARDO_TERCEROS,
  }));
}

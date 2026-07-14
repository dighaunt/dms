import "server-only";

import { dataApiGet } from "@/lib/data-api";
import { query } from "@/lib/db";

/**
 * Lecturas de la app. Ruta preferente: Neon Data API (vistas de solo lectura
 * en `public`, migración 002). Si el Data API no está configurado, no hay JWT
 * de sesión o la llamada falla, se hace la MISMA lectura por SQL directo y el
 * fallo queda en el log del servidor — nunca silencioso, nunca rompe la UI.
 */
async function leer<Fila>(
  recurso: string,
  sqlDirecto: () => Promise<Fila[]>,
): Promise<Fila[]> {
  try {
    const filas = await dataApiGet<Fila>(recurso);
    if (filas !== null) return filas;
  } catch (error) {
    console.error(`Data API falló (${recurso}); usando SQL directo:`, error);
  }
  return sqlDirecto();
}

export type ExpedienteListado = {
  id: number;
  numero_expediente: string;
  vin: string;
  marca: string;
  modelo: string;
  anio_modelo: number;
  origen: "PROPIA" | "CONSIGNADA";
  estado_unidad: string | null;
  estado_unidad_desde: string | null;
  estado_f06: string | null;
  documentos_total: number;
  documentos_escaneados: number;
};

const CAMPOS_LISTADO =
  "id,numero_expediente,vin,marca,modelo,anio_modelo,origen,estado_unidad,estado_unidad_desde,estado_f06,documentos_total,documentos_escaneados";

export function listarExpedientes(): Promise<ExpedienteListado[]> {
  return leer<ExpedienteListado>(
    `expedientes?select=${CAMPOS_LISTADO}&order=anio.desc,consecutivo.desc`,
    async () => {
      const { rows } = await query<ExpedienteListado>(
        `SELECT id, numero_expediente, vin, marca, modelo, anio_modelo, origen,
                estado_unidad, estado_unidad_desde::text AS estado_unidad_desde,
                estado_f06, documentos_total, documentos_escaneados
           FROM public.expedientes
          ORDER BY anio DESC, consecutivo DESC`,
      );
      return rows;
    },
  );
}

export type DocumentoDetalle = {
  id: number;
  folio: string;
  tipo_codigo: string;
  nombre_tipo: string;
  revision: string;
  cancelado: boolean;
  escaneado: boolean;
  version_maxima: number | null;
  pago_verificado: boolean;
  pdf_completado: boolean;
  sustituido_por_folio: string | null;
  emitido_por_nombre: string;
  emitido_en: string;
};

type ExpedienteCabecera = {
  id: number;
  numero_expediente: string;
  vin: string;
  origen: "PROPIA" | "CONSIGNADA";
  marca: string;
  modelo: string;
  anio_modelo: number;
  color: string | null;
  abierto_en: string;
  abierto_por_nombre: string;
  estado_unidad: string;
  estado_unidad_desde: string;
  estado_f06: string;
  cerrado: boolean;
  cerrado_en: string | null;
};

export type EventoHistorial = {
  estado: string;
  ocurrido_en: string;
  registrado_por_nombre: string;
};

export type AnexoResumen = {
  clave: string;
  version_maxima: number;
  subido_por_nombre: string;
};

export type ExcepcionDocumental = {
  tipo_codigo: string;
  motivo: string;
  solicitado_en: string;
  solicitado_por_nombre: string;
  autorizado_en: string;
  autorizado_por_nombre: string;
};

export type SolicitudRiesgoPendiente = {
  id: number;
  tipo_codigo: string;
  motivo: string;
  solicitado_en: string;
  solicitado_por_nombre: string;
};

export type ExpedienteDetalle = ExpedienteCabecera & {
  transiciones_validas: string[];
  documentos: DocumentoDetalle[];
  historial_unidad: EventoHistorial[];
  historial_f06: EventoHistorial[];
  anexos: AnexoResumen[];
  excepciones: ExcepcionDocumental[];
  solicitudesPendientes: SolicitudRiesgoPendiente[];
};

const CAMPOS_CABECERA =
  "id,numero_expediente,vin,origen,marca,modelo,anio_modelo,color,abierto_en,abierto_por_nombre,estado_unidad,estado_unidad_desde,estado_f06,cerrado,cerrado_en";
const CAMPOS_DOCUMENTO =
  "id,folio,tipo_codigo,nombre_tipo,revision,cancelado,escaneado,version_maxima,pago_verificado,pdf_completado,sustituido_por_folio,emitido_por_nombre,emitido_en";

export async function obtenerExpediente(id: number): Promise<ExpedienteDetalle | null> {
  const cabeceras = await leer<ExpedienteCabecera>(
    `expedientes?select=${CAMPOS_CABECERA}&id=eq.${id}`,
    async () => {
      const { rows } = await query<ExpedienteCabecera>(
        `SELECT id, numero_expediente, vin, origen, marca, modelo, anio_modelo,
                color, abierto_en::text AS abierto_en, abierto_por_nombre,
                estado_unidad, estado_unidad_desde::text AS estado_unidad_desde,
                estado_f06, cerrado, cerrado_en::text AS cerrado_en
           FROM public.expedientes
          WHERE id = $1`,
        [id],
      );
      return rows;
    },
  );
  const exp = cabeceras[0];
  if (!exp) return null;

  const [transiciones, documentos, historialUnidad, historialF06, anexos, excepciones, solicitudesPendientes] = await Promise.all([
    leer<{ hacia: string }>(
      `transiciones?select=hacia&vin=eq.${exp.vin}&order=orden.asc`,
      async () => {
        const { rows } = await query<{ hacia: string }>(
          `SELECT hacia FROM public.transiciones WHERE vin = $1 ORDER BY orden`,
          [exp.vin],
        );
        return rows;
      },
    ),
    leer<DocumentoDetalle>(
      `documentos?select=${CAMPOS_DOCUMENTO}&expediente_id=eq.${id}&order=emitido_en.asc,id.asc`,
      async () => {
        const { rows } = await query<DocumentoDetalle>(
          `SELECT id, folio, tipo_codigo, nombre_tipo, revision, cancelado,
                  escaneado, version_maxima, pago_verificado, pdf_completado, sustituido_por_folio,
                  emitido_por_nombre, emitido_en::text AS emitido_en
             FROM public.documentos
            WHERE expediente_id = $1
            ORDER BY emitido_en, id`,
          [id],
        );
        return rows;
      },
    ),
    leer<EventoHistorial>(
      `historial_unidad?select=estado,ocurrido_en,registrado_por_nombre&expediente_id=eq.${id}&order=ocurrido_en.asc`,
      async () => {
        const { rows } = await query<EventoHistorial>(
          `SELECT estado, ocurrido_en::text AS ocurrido_en, registrado_por_nombre
             FROM public.historial_unidad
            WHERE expediente_id = $1
            ORDER BY ocurrido_en`,
          [id],
        );
        return rows;
      },
    ),
    leer<EventoHistorial>(
      `historial_f06?select=estado,ocurrido_en,registrado_por_nombre&expediente_id=eq.${id}&order=ocurrido_en.asc`,
      async () => {
        const { rows } = await query<EventoHistorial>(
          `SELECT estado, ocurrido_en::text AS ocurrido_en, registrado_por_nombre
             FROM public.historial_f06
            WHERE expediente_id = $1
            ORDER BY ocurrido_en`,
          [id],
        );
        return rows;
      },
    ),
    leer<AnexoResumen>(
      `anexos?select=clave,version_maxima,subido_por_nombre&expediente_id=eq.${id}`,
      async () => {
        const { rows } = await query<AnexoResumen>(
          `SELECT clave, version_maxima, subido_por_nombre
             FROM public.anexos
            WHERE expediente_id = $1`,
          [id],
        );
        return rows;
      },
    ),
    leer<ExcepcionDocumental>(
      `excepciones_documentales?select=tipo_codigo,motivo,solicitado_en,solicitado_por_nombre,autorizado_en,autorizado_por_nombre&expediente_id=eq.${id}`,
      async () => {
        const { rows } = await query<ExcepcionDocumental>(
          `SELECT tipo_codigo, motivo, solicitado_en::text AS solicitado_en,
                  solicitado_por_nombre, autorizado_en::text AS autorizado_en,
                  autorizado_por_nombre
             FROM public.excepciones_documentales
            WHERE expediente_id = $1`,
          [id],
        );
        return rows;
      },
    ),
    leer<SolicitudRiesgoPendiente>(
      `solicitudes_riesgo?select=id,tipo_codigo,motivo,solicitado_en,solicitado_por_nombre&expediente_id=eq.${id}&decision_id=is.null`,
      async () => {
        const { rows } = await query<SolicitudRiesgoPendiente>(
          `SELECT id::int AS id, tipo_codigo, motivo, solicitado_en::text AS solicitado_en,
                  solicitado_por_nombre
             FROM public.solicitudes_riesgo
            WHERE expediente_id = $1 AND decision_id IS NULL`,
          [id],
        );
        return rows;
      },
    ),
  ]);

  return {
    ...exp,
    transiciones_validas: transiciones.map((t) => t.hacia),
    documentos,
    historial_unidad: historialUnidad,
    historial_f06: historialF06,
    anexos,
    excepciones,
    solicitudesPendientes,
  };
}

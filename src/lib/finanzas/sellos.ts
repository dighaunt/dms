import "server-only";

import { z } from "zod";

import { query } from "@/lib/db";
import { normalizarTokenSello } from "@/lib/finanzas/formato";
import {
  esquemaId,
  type AccionSellable,
  type ColorSello,
  type EstadoDocumentoFinanciero,
  type FormaSello,
  type RolFirmante,
  type SelloVerificacion,
  type TipoRci,
} from "@/lib/finanzas/tipos";

/**
 * Sellos de tinta tokenizados (migración 036).
 *
 * En papel el cuño vale porque está bajo llave; un sello dibujado en pantalla
 * se copia con una captura. Por eso cada estampado acuña un token irrepetible
 * que se imprime DENTRO del sello y permite cotejarlo contra la base.
 *
 * Aquí no se estampa nada: `estampar_sello` la invocan los disparadores de
 * firma y de cancelación, junto al hecho que acreditan, para que no pueda
 * existir una firma sin su cuño ni un cuño sin su hecho. Este módulo sólo
 * LEE: dibuja los sellos de un folio y resuelve la verificación pública.
 *
 * Como en el resto del módulo, los candados viven en plpgsql y llegan como
 * P0001 con su mensaje en español; no se atrapan ni se reescriben.
 */

// ===== HELPERS DE MAPEO =====

/** El driver entrega los bigint como cadena; aquí son número. */
function aNumero(valor: string | number): number {
  return typeof valor === "number" ? valor : Number(valor);
}

function aIso(valor: Date | string): string {
  return (valor instanceof Date ? valor : new Date(valor)).toISOString();
}

// ===== SELLOS DE UN FOLIO =====

/**
 * Un cuño ya estampado, con todo lo que el PDF y la pantalla necesitan para
 * dibujarlo sin volver a preguntar: la leyenda que va dentro, la forma y el
 * color del cuño, y el token que se imprime debajo para poder verificarlo.
 *
 * `forma` y `color` salen del catálogo y no de una decisión de la vista: un
 * cuño físico no cambia de forma entre un día y otro, y el sello impreso y el
 * de pantalla tienen que verse iguales para que uno acredite al otro.
 */
export type SelloEstampado = {
  id: number;
  documentoId: number;
  accion: AccionSellable;
  /** Texto que va dentro del cuño: "AUTORIZADO", "PAGADO", "CANCELADO"… */
  leyenda: string;
  forma: FormaSello;
  color: ColorSello;
  /** Nulo en los cuños que no nacen de una firma (cancelación, cierre). */
  rol: RolFirmante | null;
  rolEtiqueta: string | null;
  /** Se imprime dentro del sello; es lo que se teclea para verificarlo. */
  token: string;
  /** Huella del contenido en el instante del estampado. */
  hashContenido: string;
  estampadoPor: number;
  estampadoPorNombre: string;
  estampadoEn: string;
};

type FilaSello = {
  id: string | number;
  documento_id: string | number;
  accion_codigo: string;
  leyenda: string;
  forma: string;
  color: string;
  rol_firmante: string | null;
  rol_etiqueta: string | null;
  token: string;
  hash_contenido: string;
  estampado_por: string | number;
  estampado_por_nombre: string;
  estampado_en: Date | string;
};

function filaASello(fila: FilaSello): SelloEstampado {
  return {
    id: aNumero(fila.id),
    documentoId: aNumero(fila.documento_id),
    accion: fila.accion_codigo as AccionSellable,
    leyenda: fila.leyenda,
    forma: fila.forma as FormaSello,
    color: fila.color as ColorSello,
    rol: fila.rol_firmante as RolFirmante | null,
    rolEtiqueta: fila.rol_etiqueta,
    token: fila.token,
    hashContenido: fila.hash_contenido,
    estampadoPor: aNumero(fila.estampado_por),
    estampadoPorNombre: fila.estampado_por_nombre,
    estampadoEn: aIso(fila.estampado_en),
  };
}

/**
 * Los cuños de un folio en orden cronológico.
 *
 * El orden es el del reloj y no el del catálogo a propósito: la hoja tiene que
 * contar lo que pasó en el orden en que pasó —se entregó, se recibió en
 * custodia, se autorizó—, no en el orden en que alguien listó las acciones.
 * `estampado_en` es `clock_timestamp()`, así que dos sellos de la misma
 * transacción conservan su secuencia real; el id sólo desempata.
 */
export async function sellosDe(documentoId: number): Promise<SelloEstampado[]> {
  const id = esquemaId.parse(documentoId);

  const { rows } = await query<FilaSello>(
    `SELECT s.id,
            s.documento_id,
            s.accion_codigo,
            a.leyenda,
            a.forma,
            a.color,
            s.rol_firmante,
            rf.etiqueta AS rol_etiqueta,
            s.token,
            s.hash_contenido,
            s.estampado_por,
            u.nombre AS estampado_por_nombre,
            s.estampado_en
       FROM traza.sello_accion s
       JOIN traza.accion_sellable a ON a.codigo = s.accion_codigo
       JOIN traza.usuario u ON u.id = s.estampado_por
       LEFT JOIN traza.rol_firmante rf ON rf.codigo = s.rol_firmante
      WHERE s.documento_id = $1
      ORDER BY s.estampado_en, s.id`,
    [id],
  );

  return rows.map(filaASello);
}

// ===== VERIFICACIÓN PÚBLICA =====

/**
 * Tope de longitud para el texto tecleado. No es la regla del formato —de eso
 * se encarga `normalizarTokenSello`—, sólo evita correr una expresión regular
 * sobre un pegado arbitrariamente grande.
 */
const esquemaTokenTecleado = z.string().max(64);

type FilaVerificacion = {
  token: string;
  accion_codigo: string;
  leyenda: string;
  forma: string;
  color: string;
  rol_firmante: string | null;
  rol_etiqueta: string | null;
  folio: string;
  folio_completo: string;
  tipo_codigo: string;
  nombre_tipo: string;
  sucursal_clave: string;
  estado_documento: string | null;
  estampado_por_nombre: string;
  estampado_en: Date | string;
  hash_contenido: string;
};

/**
 * Verifica un token de sello y devuelve el hecho que acredita, o null.
 *
 * LO QUE SE DEVUELVE ES DELIBERADAMENTE ESCUETO. Quien teclea un token puede
 * ser cualquiera que tenga el papel en la mano: un cliente, un proveedor, un
 * consignante. Se le confirma que ese cuño es auténtico y a qué corresponde
 * —qué folio, de qué formato, de qué sucursal, qué acción, quién la estampó y
 * cuándo— y nada más. NO viaja el importe, ni el nombre del cliente, ni el del
 * beneficiario, ni el desglose del arqueo. Acreditar un hecho no exige
 * entregar el expediente, y el token no es un secreto: viene impreso en una
 * hoja que circula. Ampliar esta respuesta convertiría un dato público en una
 * puerta a datos personales y a las cifras de la operación.
 *
 * Un token que no existe y uno mal tecleado devuelven lo mismo —null—, porque
 * distinguirlos permitiría tantear tokens ajenos por diferencia de respuesta.
 *
 * Devuelve null, no una excepción: un token mal escrito es lo más común que
 * puede pasar aquí y no es un error del sistema.
 */
export async function verificarToken(token: string): Promise<SelloVerificacion | null> {
  const tecleado = esquemaTokenTecleado.safeParse(token);
  if (!tecleado.success) return null;

  // Primero la forma: `normalizarTokenSello` acepta el token pegado o con
  // separadores arbitrarios, porque quien lo captura lo copia de un impreso.
  const normalizado = normalizarTokenSello(tecleado.data);
  if (normalizado === null) return null;

  // Después el dígito verificador, ANTES de tocar `v_sello_verificacion`. El
  // dígito pondera cada carácter por su posición, así que detecta el error de
  // transcripción más común —dos caracteres transpuestos— sin buscar nada.
  // `token_sello_bien_formado` es IMMUTABLE y no lee tabla alguna: es
  // aritmética. El algoritmo NO se reescribe aquí en TypeScript para que
  // exista una sola definición del verificador; si hubiera dos podrían
  // separarse y un token válido quedaría rechazado antes de llegar a la base.
  const { rows: comprobacion } = await query<{ bien_formado: boolean }>(
    `SELECT traza.token_sello_bien_formado($1) AS bien_formado`,
    [normalizado],
  );
  if (!comprobacion[0]?.bien_formado) return null;

  const { rows } = await query<FilaVerificacion>(
    `SELECT v.token,
            v.accion_codigo,
            v.leyenda,
            v.forma,
            v.color,
            v.rol_firmante,
            v.rol_etiqueta,
            v.folio,
            v.folio_completo,
            v.tipo_codigo,
            v.nombre_tipo,
            v.sucursal_clave,
            v.estado_documento,
            v.estampado_por_nombre,
            v.estampado_en,
            v.hash_contenido
       FROM traza.v_sello_verificacion v
      WHERE v.token = $1`,
    [normalizado],
  );

  const fila = rows[0];
  if (!fila) return null;

  return {
    token: fila.token,
    accion: fila.accion_codigo as AccionSellable,
    leyenda: fila.leyenda,
    forma: fila.forma as FormaSello,
    color: fila.color as ColorSello,
    rol: fila.rol_firmante as RolFirmante | null,
    rolEtiqueta: fila.rol_etiqueta,
    folio: fila.folio,
    folioCompleto: fila.folio_completo,
    tipoCodigo: fila.tipo_codigo as TipoRci,
    nombreTipo: fila.nombre_tipo,
    sucursalClave: fila.sucursal_clave,
    estadoDocumento: fila.estado_documento as EstadoDocumentoFinanciero | null,
    estampadoPorNombre: fila.estampado_por_nombre,
    estampadoEn: aIso(fila.estampado_en),
    hashContenido: fila.hash_contenido,
  };
}

// ===== CATÁLOGO DE ACCIONES =====

/** Renglón de `accion_sellable`: la descripción del cuño, no un estampado. */
export type FichaAccionSellable = {
  codigo: AccionSellable;
  leyenda: string;
  forma: FormaSello;
  color: ColorSello;
  orden: number;
};

/**
 * El catálogo completo de cuños, en el orden en que el manual los enumera.
 *
 * Se lee de la base y no de la copia de `ACCIONES_SELLABLES` en tipos.ts
 * porque la leyenda, la forma y el color son datos administrables: dar de alta
 * un firmante nuevo con su cuño es un renglón, no un despliegue.
 */
export async function accionesSellables(): Promise<FichaAccionSellable[]> {
  const { rows } = await query<{
    codigo: string;
    leyenda: string;
    forma: string;
    color: string;
    orden: number;
  }>(
    `SELECT a.codigo, a.leyenda, a.forma, a.color, a.orden
       FROM traza.accion_sellable a
      ORDER BY a.orden`,
  );

  return rows.map((fila) => ({
    codigo: fila.codigo as AccionSellable,
    leyenda: fila.leyenda,
    forma: fila.forma as FormaSello,
    color: fila.color as ColorSello,
    orden: fila.orden,
  }));
}

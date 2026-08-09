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

function aNumero(valor: string | number): number {
  return typeof valor === "number" ? valor : Number(valor);
}

function aIso(valor: Date | string): string {
  return (valor instanceof Date ? valor : new Date(valor)).toISOString();
}

export type SelloEstampado = {
  id: number;
  documentoId: number;
  accion: AccionSellable;
  
  leyenda: string;
  forma: FormaSello;
  color: ColorSello;
  
  rol: RolFirmante | null;
  rolEtiqueta: string | null;
  
  token: string;
  
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

export async function verificarToken(token: string): Promise<SelloVerificacion | null> {
  const tecleado = esquemaTokenTecleado.safeParse(token);
  if (!tecleado.success) return null;

  
  const normalizado = normalizarTokenSello(tecleado.data);
  if (normalizado === null) return null;

  

  

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

export type FichaAccionSellable = {
  codigo: AccionSellable;
  leyenda: string;
  forma: FormaSello;
  color: ColorSello;
  orden: number;
};

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

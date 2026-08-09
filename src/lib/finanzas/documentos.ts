import "server-only";

import { createHash } from "node:crypto";

import { z } from "zod";

import { query, withTransaction } from "@/lib/db";
import {
  esquemaEstadoDocumento,
  esquemaFechaIso,
  esquemaHashSha256,
  esquemaId,
  esquemaIdentificacion,
  esquemaNombrePersona,
  esquemaPinFirma,
  esquemaRolFirmante,
  esquemaTipoRci,
  type DocumentoFinanciero,
  type EstadoDocumentoFinanciero,
  type FirmaDocumento,
  type FirmaPendiente,
  type MetodoFirma,
  type RolFirmante,
  type TipoRci,
} from "@/lib/finanzas/tipos";

export type FilaDocumentoFinanciero = {
  id: string | number;
  folio: string;
  folio_completo: string;
  tipo_codigo: string;
  nombre_tipo: string;
  revision: string;
  sucursal_id: string | number;
  sucursal_clave: string;
  sucursal_nombre: string;
  consecutivo: string | number;
  estado: string | null;
  estado_desde: Date | string | null;
  estado_motivo: string | null;
  complementa_a: string | number | null;
  complementado_por: string | number | null;
  creado_por: string | number;
  creado_en: Date | string;
};

export const SELECT_DOCUMENTO_FINANCIERO = `
  SELECT v.id,
         v.folio,
         v.folio_completo,
         v.tipo_codigo,
         v.nombre_tipo,
         v.revision,
         v.sucursal_id,
         v.sucursal_clave,
         v.sucursal_nombre,
         v.consecutivo,
         v.estado,
         v.estado_desde,
         v.estado_motivo,
         v.complementa_a,
         v.complementado_por,
         v.creado_por,
         v.creado_en
    FROM traza.v_documento_financiero v`;

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

export function filaADocumento(fila: FilaDocumentoFinanciero): DocumentoFinanciero {
  return {
    id: aNumero(fila.id),
    folio: fila.folio,
    folioCompleto: fila.folio_completo,
    tipoCodigo: fila.tipo_codigo as TipoRci,
    nombreTipo: fila.nombre_tipo,
    revision: fila.revision,
    sucursalId: aNumero(fila.sucursal_id),
    sucursalClave: fila.sucursal_clave,
    sucursalNombre: fila.sucursal_nombre,
    consecutivo: aNumero(fila.consecutivo),
    estado: fila.estado as EstadoDocumentoFinanciero | null,
    estadoDesde: aIsoOpcional(fila.estado_desde),
    estadoMotivo: fila.estado_motivo,
    complementaA: aNumeroOpcional(fila.complementa_a),
    complementadoPor: aNumeroOpcional(fila.complementado_por),
    creadoPor: aNumero(fila.creado_por),
    creadoEn: aIso(fila.creado_en),
  };
}

export const esquemaEmitirFolio = z.object({
  tipo: esquemaTipoRci,
  sucursalId: esquemaId,
  
  usuario: esquemaId,
  
  complementaA: esquemaId.nullish(),
});

export type EntradaEmitirFolio = z.input<typeof esquemaEmitirFolio>;

export async function emitirFolio(entrada: EntradaEmitirFolio): Promise<DocumentoFinanciero> {
  const datos = esquemaEmitirFolio.parse(entrada);

  return withTransaction(async (cliente) => {
    const emitido = await cliente.query<{ id: string | number }>(
      `SELECT d.id FROM traza.emitir_folio_financiero($1, $2, $3, $4) AS d`,
      [datos.tipo, datos.sucursalId, datos.usuario, datos.complementaA ?? null],
    );

    const { rows } = await cliente.query<FilaDocumentoFinanciero>(
      `${SELECT_DOCUMENTO_FINANCIERO} WHERE v.id = $1`,
      [emitido.rows[0].id],
    );
    return filaADocumento(rows[0]);
  });
}

export async function obtenerDocumento(id: number): Promise<DocumentoFinanciero | null> {
  const documentoId = esquemaId.parse(id);
  const { rows } = await query<FilaDocumentoFinanciero>(
    `${SELECT_DOCUMENTO_FINANCIERO} WHERE v.id = $1`,
    [documentoId],
  );
  return rows[0] ? filaADocumento(rows[0]) : null;
}

const esquemaUnoOVarios = <T extends z.ZodType>(esquema: T) =>
  z.union([esquema, z.array(esquema).nonempty()]).optional();

export const esquemaFiltroDocumentos = z.object({
  sucursalId: esquemaId.optional(),
  tipo: esquemaUnoOVarios(esquemaTipoRci),
  estado: esquemaUnoOVarios(esquemaEstadoDocumento),
  
  desde: esquemaFechaIso.optional(),
  hasta: esquemaFechaIso.optional(),
  
  limite: z.number().int().positive().max(1000).default(200),
});

export type FiltroDocumentos = z.input<typeof esquemaFiltroDocumentos>;

const comoLista = <T>(valor: T | T[] | undefined): T[] =>
  valor === undefined ? [] : Array.isArray(valor) ? valor : [valor];

export async function listarDocumentos(
  filtro: FiltroDocumentos = {},
): Promise<DocumentoFinanciero[]> {
  const f = esquemaFiltroDocumentos.parse(filtro);

  const condiciones: string[] = [];
  const valores: unknown[] = [];
  const marcador = (valor: unknown): string => {
    valores.push(valor);
    return `$${valores.length}`;
  };

  if (f.sucursalId !== undefined) {
    condiciones.push(`v.sucursal_id = ${marcador(f.sucursalId)}`);
  }
  const tipos = comoLista(f.tipo);
  if (tipos.length > 0) {
    condiciones.push(`v.tipo_codigo = ANY(${marcador(tipos)}::text[])`);
  }
  const estados = comoLista(f.estado);
  if (estados.length > 0) {
    condiciones.push(`v.estado = ANY(${marcador(estados)}::text[])`);
  }

  
  if (f.desde !== undefined) {
    condiciones.push(`v.creado_en::date >= ${marcador(f.desde)}::date`);
  }
  if (f.hasta !== undefined) {
    condiciones.push(`v.creado_en::date <= ${marcador(f.hasta)}::date`);
  }

  const donde = condiciones.length > 0 ? ` WHERE ${condiciones.join(" AND ")}` : "";
  const { rows } = await query<FilaDocumentoFinanciero>(
    `${SELECT_DOCUMENTO_FINANCIERO}${donde}
      ORDER BY v.creado_en DESC, v.id DESC
      LIMIT ${marcador(f.limite)}`,
    valores,
  );
  return rows.map(filaADocumento);
}

export async function enviarAFirma(documentoId: number, usuario: number): Promise<void> {
  const id = esquemaId.parse(documentoId);
  const usuarioId = esquemaId.parse(usuario);

  await withTransaction(async (cliente) => {
    await cliente.query(`SELECT traza.validar_arqueo_rci01($1)`, [id]);
    await cliente.query(
      `SELECT traza.cambiar_estado_documento_fin($1, 'PENDIENTE_DE_FIRMA', $2)`,
      [id, usuarioId],
    );
  });
}

export async function regresarABorrador(documentoId: number, usuario: number): Promise<void> {
  const id = esquemaId.parse(documentoId);
  const usuarioId = esquemaId.parse(usuario);
  await query(`SELECT traza.cambiar_estado_documento_fin($1, 'BORRADOR', $2)`, [id, usuarioId]);
}

export async function cancelarFolio(
  documentoId: number,
  usuario: number,
  motivo: string,
): Promise<void> {
  const id = esquemaId.parse(documentoId);
  const usuarioId = esquemaId.parse(usuario);
  const explicacion = z.string().trim().max(1000).parse(motivo);

  await query(`SELECT traza.cambiar_estado_documento_fin($1, 'CANCELADO', $2, $3)`, [
    id,
    usuarioId,
    explicacion,
  ]);
}

export const esquemaFirmaInterna = z.object({
  documentoId: esquemaId,
  rol: esquemaRolFirmante,
  
  usuario: esquemaId,
  pin: esquemaPinFirma,
  hashContenido: esquemaHashSha256,
  
  origenSesion: z.string().trim().max(200).nullish(),
});

export type EntradaFirmaInterna = z.input<typeof esquemaFirmaInterna>;

export async function firmarComoInterno(
  entrada: EntradaFirmaInterna,
): Promise<EstadoDocumentoFinanciero> {
  const datos = esquemaFirmaInterna.parse(entrada);

  const { rows } = await query<{ estado: EstadoDocumentoFinanciero }>(
    `SELECT traza.firmar_documento_financiero($1, $2, $3, $4, $5, $6) AS estado`,
    [
      datos.documentoId,
      datos.rol,
      datos.usuario,
      datos.pin,
      datos.hashContenido,
      datos.origenSesion ?? null,
    ],
  );
  return rows[0].estado;
}

export const esquemaFirmaTercero = z.object({
  documentoId: esquemaId,
  rol: esquemaRolFirmante,
  nombre: esquemaNombrePersona,
  idTipo: esquemaIdentificacion.shape.tipo,
  idNumero: esquemaIdentificacion.shape.numero,
  
  atestiguaUsuario: esquemaId,
  pinAtestigua: esquemaPinFirma,
  hashContenido: esquemaHashSha256,
  
  trazoRuta: z.string().trim().max(500).nullish(),
  origenSesion: z.string().trim().max(200).nullish(),
});

export type EntradaFirmaTercero = z.input<typeof esquemaFirmaTercero>;

export async function firmarComoTercero(
  entrada: EntradaFirmaTercero,
): Promise<EstadoDocumentoFinanciero> {
  const datos = esquemaFirmaTercero.parse(entrada);

  const { rows } = await query<{ estado: EstadoDocumentoFinanciero }>(
    `SELECT traza.firmar_documento_externo($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) AS estado`,
    [
      datos.documentoId,
      datos.rol,
      datos.nombre,
      datos.idTipo,
      datos.idNumero,
      datos.atestiguaUsuario,
      datos.pinAtestigua,
      datos.hashContenido,
      datos.trazoRuta ?? null,
      datos.origenSesion ?? null,
    ],
  );
  return rows[0].estado;
}

type FilaFirma = {
  documento_id: string | number;
  rol_firmante: string;
  rol_etiqueta: string;
  metodo: string;
  usuario_id: string | number | null;
  usuario_nombre: string | null;
  firmante_nombre: string | null;
  firmante_id_tipo: string | null;
  firmante_id_numero: string | null;
  atestiguado_por: string | number | null;
  atestiguado_por_nombre: string | null;
  trazo_ruta: string | null;
  firmado_en: Date | string;
  hash_contenido: string;
  origen_sesion: string | null;
};

export async function firmasDe(documentoId: number): Promise<FirmaDocumento[]> {
  const id = esquemaId.parse(documentoId);

  const { rows } = await query<FilaFirma>(
    `SELECT f.documento_id,
            f.rol_firmante,
            rf.etiqueta AS rol_etiqueta,
            f.metodo,
            f.usuario_id,
            u.nombre AS usuario_nombre,
            f.firmante_nombre,
            f.firmante_id_tipo,
            f.firmante_id_numero,
            f.atestiguado_por,
            a.nombre AS atestiguado_por_nombre,
            f.trazo_ruta,
            f.firmado_en,
            f.hash_contenido,
            f.origen_sesion
       FROM traza.firma_documento_financiero f
       JOIN traza.documento_financiero d ON d.id = f.documento_id
       JOIN traza.rol_firmante rf ON rf.codigo = f.rol_firmante
       LEFT JOIN traza.firma_requerida fr
              ON fr.tipo_codigo = d.tipo_codigo AND fr.rol_firmante = f.rol_firmante
       LEFT JOIN traza.usuario u ON u.id = f.usuario_id
       LEFT JOIN traza.usuario a ON a.id = f.atestiguado_por
      WHERE f.documento_id = $1
      ORDER BY fr.orden NULLS LAST, f.firmado_en`,
    [id],
  );

  return rows.map((fila) => ({
    documentoId: aNumero(fila.documento_id),
    rol: fila.rol_firmante as RolFirmante,
    rolEtiqueta: fila.rol_etiqueta,
    metodo: fila.metodo as MetodoFirma,
    usuarioId: aNumeroOpcional(fila.usuario_id),
    usuarioNombre: fila.usuario_nombre,
    firmanteNombre: fila.firmante_nombre,
    firmanteIdTipo: fila.firmante_id_tipo,
    firmanteIdNumero: fila.firmante_id_numero,
    atestiguadoPor: aNumeroOpcional(fila.atestiguado_por),
    atestiguadoPorNombre: fila.atestiguado_por_nombre,
    trazoRuta: fila.trazo_ruta,
    firmadoEn: aIso(fila.firmado_en),
    hashContenido: fila.hash_contenido,
    origenSesion: fila.origen_sesion,
  }));
}

export async function firmasPendientes(documentoId: number): Promise<FirmaPendiente[]> {
  const id = esquemaId.parse(documentoId);

  const { rows } = await query<{
    rol_firmante: string;
    etiqueta: string;
    obligatoria: boolean;
    orden: number;
    exige_usuario_interno: boolean;
  }>(
    `SELECT fr.rol_firmante,
            rf.etiqueta,
            fr.obligatoria,
            fr.orden,
            rf.exige_usuario_interno
       FROM traza.documento_financiero d
       JOIN traza.firma_requerida fr ON fr.tipo_codigo = d.tipo_codigo
       JOIN traza.rol_firmante rf ON rf.codigo = fr.rol_firmante
      WHERE d.id = $1
        AND NOT EXISTS (
              SELECT 1 FROM traza.firma_documento_financiero f
               WHERE f.documento_id = d.id AND f.rol_firmante = fr.rol_firmante)
      ORDER BY fr.orden`,
    [id],
  );

  return rows.map((fila) => ({
    rol: fila.rol_firmante as RolFirmante,
    etiqueta: fila.etiqueta,
    obligatoria: fila.obligatoria,
    orden: fila.orden,
    exigeUsuarioInterno: fila.exige_usuario_interno,
  }));
}

function serializarCanonico(valor: unknown, visitados: WeakSet<object>): string {
  if (valor === null || valor === undefined) return "null";
  if (typeof valor === "bigint") return JSON.stringify(valor.toString());
  if (valor instanceof Date) return JSON.stringify(valor.toISOString());

  if (typeof valor === "object") {
    if (visitados.has(valor)) {
      throw new Error("El contenido a firmar no puede contener referencias circulares");
    }
    visitados.add(valor);

    const texto = Array.isArray(valor)
      ? `[${valor.map((elemento) => serializarCanonico(elemento, visitados)).join(",")}]`
      : `{${Object.keys(valor as Record<string, unknown>)
          .sort()
          .filter((clave) => (valor as Record<string, unknown>)[clave] !== undefined)
          .map(
            (clave) =>
              `${JSON.stringify(clave)}:${serializarCanonico(
                (valor as Record<string, unknown>)[clave],
                visitados,
              )}`,
          )
          .join(",")}}`;

    visitados.delete(valor);
    return texto;
  }

  const json = JSON.stringify(valor);
  return json === undefined ? "null" : json;
}

export function calcularHashContenido(contenido: unknown): string {
  return createHash("sha256")
    .update(serializarCanonico(contenido, new WeakSet()), "utf8")
    .digest("hex");
}

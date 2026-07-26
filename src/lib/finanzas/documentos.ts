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

/**
 * Servicio común a los siete formatos CACM-RCI: emitir el folio, consultarlo,
 * moverlo de estado y recoger sus firmas. Lo propio de cada formato (el
 * arqueo del recibo, la liquidación de la consigna, el arqueo del corte) vive
 * en su propio módulo y se apoya en éste.
 *
 * Los candados del manual —consecutivo sin huecos, transiciones válidas,
 * segregación de firmantes, PIN, inmutabilidad tras la firma— ya están
 * escritos en plpgsql (migraciones 034 a 037). Aquí NO se repiten: se
 * invocan. Cuando uno se dispara llega como P0001 con su mensaje en español y
 * debe propagarse tal cual; `respuestaError` de "@/lib/api" lo traduce a un
 * 409 que la persona operadora puede leer.
 */

// ===== LECTURA DE LA VISTA =====

/** Fila cruda de `v_documento_financiero`, antes de normalizarse. */
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

/**
 * Proyección única de la vista. Se exporta como constante para que los
 * servicios de cada formato lean SIEMPRE las mismas columnas y `filaADocumento`
 * pueda mapearlas sin sorpresas. Es SQL fijo: no admite —ni necesita—
 * interpolar valor alguno.
 */
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

/** Los bigint de Postgres llegan como cadena por el driver; aquí son número. */
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

/**
 * Normaliza una fila de `v_documento_financiero`. Se exporta para que ningún
 * otro servicio del módulo vuelva a escribir este mapeo: si la vista cambia,
 * cambia en un solo lugar.
 *
 * `tipo_codigo` y `estado` se afirman contra sus uniones sin volver a
 * validarlos porque la base ya los restringe (CHECK del tipo y llave foránea
 * al catálogo de estados); comprobarlos aquí sería desconfiar del esquema.
 */
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

// ===== EMISIÓN DEL FOLIO =====

export const esquemaEmitirFolio = z.object({
  tipo: esquemaTipoRci,
  sucursalId: esquemaId,
  /** Id del usuario de sesión. Jamás se acepta del cuerpo de la petición. */
  usuario: esquemaId,
  /** Folio firmado que este documento corrige, si es un complementario. */
  complementaA: esquemaId.nullish(),
});

export type EntradaEmitirFolio = z.input<typeof esquemaEmitirFolio>;

/**
 * Entrega el folio consecutivo y deja el documento en BORRADOR.
 *
 * El folio se emite al CREAR y no al firmar porque quien captura necesita
 * citarlo. Todo ocurre en una transacción para que un folio consumido siempre
 * tenga su fila y su historial: un hueco en el consecutivo no se puede
 * explicar después.
 */
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

// ===== CONSULTA =====

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
  /** Ambos extremos incluidos, sobre la fecha de emisión del folio. */
  desde: esquemaFechaIso.optional(),
  hasta: esquemaFechaIso.optional(),
  /**
   * Un listado de folios crece todos los días y nadie lee diez mil renglones;
   * el tope evita que una pantalla arrastre el histórico completo.
   */
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
  // Se compara la fecha civil del servidor de base, el mismo criterio con el
  // que `folios_sin_firmar_del_dia` y el corte deciden a qué día pertenece un
  // folio; usar otro haría que un listado y un corte no coincidieran.
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

// ===== CAMBIOS DE ESTADO =====

/**
 * Cierra la captura y abre la firma.
 *
 * De paso invoca `validar_arqueo_rci01`: ese candado existe en la base pero
 * ningún disparador lo dispara, porque el desglose de denominaciones se
 * captura en varias filas después de la cabecera y sólo tiene sentido
 * comprobarlo cuando la captura se da por terminada. Éste es ese momento. La
 * función se ignora sola si el documento no es un recibo de caja, así que no
 * hace falta preguntar el tipo antes.
 */
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

/** Devuelve un folio a captura cuando se detecta un error antes de firmarlo. */
export async function regresarABorrador(documentoId: number, usuario: number): Promise<void> {
  const id = esquemaId.parse(documentoId);
  const usuarioId = esquemaId.parse(usuario);
  await query(`SELECT traza.cambiar_estado_documento_fin($1, 'BORRADOR', $2)`, [id, usuarioId]);
}

/**
 * Un borrador que se abandona no se borra: se cancela con motivo. El folio
 * queda ocupado y explicado, como una forma de papel inutilizada que se
 * archiva en vez de tirarse.
 *
 * El largo mínimo de la explicación lo exige `cambiar_estado_documento_fin`;
 * aquí sólo se acota el tamaño del texto que viaja, para no duplicar la regla
 * ni dejar que dos versiones de ella se separen.
 */
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

// ===== FIRMAS =====

export const esquemaFirmaInterna = z.object({
  documentoId: esquemaId,
  rol: esquemaRolFirmante,
  /** Id del firmante: es SU PIN el que se coteja, no el de quien opera. */
  usuario: esquemaId,
  pin: esquemaPinFirma,
  hashContenido: esquemaHashSha256,
  /** Rastro del dispositivo o sesión desde el que se rubricó. */
  origenSesion: z.string().trim().max(200).nullish(),
});

export type EntradaFirmaInterna = z.input<typeof esquemaFirmaInterna>;

/**
 * Firma de personal de la empresa con su usuario y su PIN.
 *
 * Devuelve el estado en que quedó el documento: FIRMADO si ésta era la última
 * firma obligatoria, PENDIENTE_DE_FIRMA si todavía falta alguna. Quien decide
 * eso es `cerrar_si_firmas_completas`, no esta capa.
 */
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
  /** Usuario interno que presencia el acto y responde por él. */
  atestiguaUsuario: esquemaId,
  pinAtestigua: esquemaPinFirma,
  hashContenido: esquemaHashSha256,
  /** Ruta del trazo autógrafo levantado en pantalla, si se capturó. */
  trazoRuta: z.string().trim().max(500).nullish(),
  origenSesion: z.string().trim().max(200).nullish(),
});

export type EntradaFirmaTercero = z.input<typeof esquemaFirmaTercero>;

/**
 * Firma de un tercero —consignante, trabajador, beneficiario de un pago— que
 * no tiene cuenta en el sistema. Se identifica con documento oficial y su
 * rúbrica se levanta de forma presencial; el PIN que se verifica es el del
 * usuario interno que la atestigua, porque es quien responde por el acto.
 */
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

/**
 * Firmas ya levantadas, en el orden en que aparecen en la forma impresa
 * (`firma_requerida.orden`), para que la pantalla y el papel se lean igual.
 */
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

/**
 * Firmas que este formato pide y todavía no tiene, cruzando `firma_requerida`
 * con las ya levantadas.
 *
 * Se devuelven también las opcionales —el testigo del RCI-01, el socio
 * enterado del corte— con su bandera `obligatoria`: sólo las obligatorias
 * detienen el cierre, pero quien opera necesita ver que puede recabarlas.
 */
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

// ===== HUELLA DEL CONTENIDO =====

/**
 * Serialización canónica: mismas claves y mismos valores producen siempre el
 * MISMO texto, sin importar en qué orden vinieran las claves del objeto.
 *
 *  - Los objetos se recorren con sus claves ordenadas.
 *  - Los arreglos conservan su orden: en un desglose de denominaciones o en
 *    una lista de gastos, el orden es parte del dato.
 *  - Las claves con valor `undefined` se omiten, como hace JSON; dentro de un
 *    arreglo `undefined` se escribe como `null` para no correr las posiciones.
 *  - `bigint` (los centavos de "@/lib/finanzas/calculos") y `Date` se escriben
 *    como texto, porque `JSON.stringify` rompe con el primero y depende de la
 *    zona horaria con el segundo.
 */
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

/**
 * Huella sha256 del contenido de un documento, en hexadecimal minúsculo.
 *
 * Es lo que hace DETECTABLE una alteración posterior: la huella se guarda con
 * cada firma y con cada sello, así que un contenido que hoy no produzca la
 * misma huella que se guardó al firmarlo no es el que esa persona firmó.
 *
 * Por eso la serialización es canónica y estable: dos objetos equivalentes
 * cuyas claves vengan en distinto orden DEBEN producir el mismo hash. De otro
 * modo, reordenar un formulario o cambiar el orden de un `SELECT` levantaría
 * una falsa alarma de alteración y la huella dejaría de significar algo.
 *
 * Cambiar esta función invalida la verificación de todo lo ya firmado.
 */
export function calcularHashContenido(contenido: unknown): string {
  return createHash("sha256")
    .update(serializarCanonico(contenido, new WeakSet()), "utf8")
    .digest("hex");
}

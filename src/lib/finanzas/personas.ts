import "server-only";

import { z } from "zod";

import { query } from "@/lib/db";
import { aCentavos, deCentavos, posicionSocio, type PosicionSocio } from "@/lib/finanzas/calculos";
import {
  esquemaCategoriaPersona,
  esquemaFechaIso,
  esquemaId,
  type CategoriaPersona,
} from "@/lib/finanzas/tipos";

export {
  CATEGORIAS_PERSONA,
  ETIQUETA_CATEGORIA_PERSONA,
  esquemaCategoriaPersona,
  type CategoriaPersona,
} from "@/lib/finanzas/tipos";

function aNumero(valor: string | number): number {
  return typeof valor === "number" ? valor : Number(valor);
}

function aNumeroOpcional(valor: string | number | null | undefined): number | null {
  return valor === null || valor === undefined ? null : aNumero(valor);
}

function aIsoOpcional(valor: Date | string | null | undefined): string | null {
  if (valor === null || valor === undefined) return null;
  return (valor instanceof Date ? valor : new Date(valor)).toISOString();
}

function aImporte(valor: string | null | undefined): string {
  return deCentavos(aCentavos(valor ?? "0") ?? 0n);
}

const textoOpcional = (maximo: number) =>
  z
    .string()
    .trim()
    .max(maximo)
    .nullish()
    .transform((valor) => (valor ? valor : null));

const esquemaRfc = z
  .string()
  .trim()
  .toUpperCase()

  .refine(
    (valor) => valor === "" || /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/.test(valor),
    "El RFC se escribe con 3 o 4 letras, la fecha en 6 dígitos y la homoclave, por ejemplo XAXX010101000",
  )
  .nullish()
  .transform((valor) => (valor ? valor : null));

const esquemaTelefono = z
  .string()
  .transform((valor) => valor.replace(/[\s()-]/g, ""))
  .refine(
    (valor) => valor === "" || /^[0-9]{10}$/.test(valor),
    "El teléfono se captura a diez dígitos, con lada y sin el 01",
  )
  .nullish()
  .transform((valor) => (valor ? valor : null));

const esquemaParticipacion = z
  .union([z.string(), z.number()])
  .transform((valor) => String(valor).trim())
  .refine(
    (valor) => valor === "" || /^\d{1,3}(?:\.\d{1,2})?$/.test(valor),
    "La participación se escribe en por ciento, con hasta dos decimales, por ejemplo 33.33",
  )
  .refine((valor) => {
    if (valor === "") return true;
    const porcentaje = Number(valor);
    return porcentaje > 0 && porcentaje <= 100;
  }, "La participación debe ser mayor que cero y no puede pasar de 100 por ciento")
  .nullish()
  .transform((valor) => (valor ? valor : null));

function paraLike(termino: string): string {
  return termino.toLowerCase().replace(/([\\%_])/g, "\\$1");
}

export type Persona = {
  id: number;
  nombre: string;
  
  idTipo: string | null;
  idNumero: string | null;
  rfc: string | null;
  telefono: string | null;
  domicilio: string | null;
  categoria: CategoriaPersona;
  notas: string | null;
  
  usuarioId: number | null;
  activa: boolean;
  creadaPor: number;
  creadaEn: string | null;
};

type FilaPersona = {
  id: string | number;
  nombre: string;
  id_tipo: string | null;
  id_numero: string | null;
  rfc: string | null;
  telefono: string | null;
  domicilio: string | null;
  categoria: string;
  notas: string | null;
  usuario_id: string | number | null;
  activa: boolean;
  creada_por: string | number;
  creada_en: Date | string | null;
};

const COLUMNAS_PERSONA = `p.id, p.nombre, p.id_tipo, p.id_numero, p.rfc, p.telefono,
         p.domicilio, p.categoria, p.notas, p.usuario_id, p.activa,
         p.creada_por, p.creada_en`;

const COLUMNAS_PERSONA_RETURNING = `id, nombre, id_tipo, id_numero, rfc, telefono,
         domicilio, categoria, notas, usuario_id, activa, creada_por, creada_en`;

function filaAPersona(fila: FilaPersona): Persona {
  return {
    id: aNumero(fila.id),
    nombre: fila.nombre,
    idTipo: fila.id_tipo,
    idNumero: fila.id_numero,
    rfc: fila.rfc,
    telefono: fila.telefono,
    domicilio: fila.domicilio,
    categoria: fila.categoria as CategoriaPersona,
    notas: fila.notas,
    usuarioId: aNumeroOpcional(fila.usuario_id),
    activa: fila.activa,
    creadaPor: aNumero(fila.creada_por),
    creadaEn: aIsoOpcional(fila.creada_en),
  };
}

export const esquemaFiltroPersonas = z.object({
  
  busqueda: z.string().trim().max(200).optional(),
  categoria: esquemaCategoriaPersona.optional(),
  
  soloActivas: z.boolean().default(true),
  
  limite: z.number().int().positive().max(500).default(50),
});

export type FiltroPersonas = z.input<typeof esquemaFiltroPersonas>;

export async function listarPersonas(filtro: FiltroPersonas = {}): Promise<Persona[]> {
  const { busqueda, categoria, soloActivas, limite } = esquemaFiltroPersonas.parse(filtro);
  const termino = busqueda ? paraLike(busqueda) : null;

  const { rows } = await query<FilaPersona>(
    `SELECT ${COLUMNAS_PERSONA}
       FROM traza.persona p
      WHERE (NOT $1::boolean OR p.activa)
        AND ($2::text IS NULL OR p.categoria = $2)
        AND ($3::text IS NULL OR lower(p.nombre) LIKE '%' || $3 || '%' ESCAPE '\\')
      ORDER BY ($3::text IS NOT NULL
                AND lower(p.nombre) LIKE $3 || '%' ESCAPE '\\') DESC,
               p.nombre
      LIMIT $4`,
    [soloActivas, categoria ?? null, termino, limite],
  );

  return rows.map(filaAPersona);
}

export async function obtenerPersona(personaId: number): Promise<Persona | null> {
  const id = esquemaId.parse(personaId);

  const { rows } = await query<FilaPersona>(
    `SELECT ${COLUMNAS_PERSONA} FROM traza.persona p WHERE p.id = $1`,
    [id],
  );
  return rows[0] ? filaAPersona(rows[0]) : null;
}

const camposPersona = {
  nombre: z
    .string()
    .trim()
    .min(3, "El nombre debe tener al menos 3 caracteres")
    .max(200),
  idTipo: textoOpcional(40),
  idNumero: textoOpcional(60),
  rfc: esquemaRfc,
  telefono: esquemaTelefono,
  domicilio: textoOpcional(500),
  categoria: esquemaCategoriaPersona.default("OTRO"),
  notas: textoOpcional(1000),
  
  usuarioId: esquemaId.nullish().transform((valor) => valor ?? null),
};

function exigirIdentificacionCompleta(
  datos: { idTipo: string | null; idNumero: string | null },
  ctx: z.RefinementCtx,
): void {
  if (datos.idTipo !== null && datos.idNumero === null) {
    ctx.addIssue({
      code: "custom",
      path: ["idNumero"],
      message: "Captura el número de la identificación, o deja también en blanco el tipo",
    });
  }
  if (datos.idNumero !== null && datos.idTipo === null) {
    ctx.addIssue({
      code: "custom",
      path: ["idTipo"],
      message: "Indica de qué identificación es ese número (INE, pasaporte, licencia…)",
    });
  }
}

export const esquemaCrearPersona = z.object(camposPersona).superRefine(exigirIdentificacionCompleta);

export type EntradaCrearPersona = z.input<typeof esquemaCrearPersona>;

export async function crearPersona(
  entrada: EntradaCrearPersona,
  usuario: number,
): Promise<Persona> {
  const datos = esquemaCrearPersona.parse(entrada);
  const usuarioId = esquemaId.parse(usuario);

  const { rows } = await query<FilaPersona>(
    `INSERT INTO traza.persona
       (nombre, id_tipo, id_numero, rfc, telefono, domicilio, categoria, notas,
        usuario_id, creada_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING ${COLUMNAS_PERSONA_RETURNING}`,
    [
      datos.nombre,
      datos.idTipo,
      datos.idNumero,
      datos.rfc,
      datos.telefono,
      datos.domicilio,
      datos.categoria,
      datos.notas,
      datos.usuarioId,
      usuarioId,
    ],
  );
  return filaAPersona(rows[0]);
}

export const esquemaActualizarPersona = esquemaCrearPersona;

export type EntradaActualizarPersona = z.input<typeof esquemaActualizarPersona>;

export async function actualizarPersona(
  personaId: number,
  entrada: EntradaActualizarPersona,
): Promise<Persona | null> {
  const id = esquemaId.parse(personaId);
  const datos = esquemaActualizarPersona.parse(entrada);

  const { rows } = await query<FilaPersona>(
    `UPDATE traza.persona
        SET nombre     = $2,
            id_tipo    = $3,
            id_numero  = $4,
            rfc        = $5,
            telefono   = $6,
            domicilio  = $7,
            categoria  = $8,
            notas      = $9,
            usuario_id = $10
      WHERE id = $1
      RETURNING ${COLUMNAS_PERSONA_RETURNING}`,
    [
      id,
      datos.nombre,
      datos.idTipo,
      datos.idNumero,
      datos.rfc,
      datos.telefono,
      datos.domicilio,
      datos.categoria,
      datos.notas,
      datos.usuarioId,
    ],
  );
  return rows[0] ? filaAPersona(rows[0]) : null;
}

async function marcarPersona(personaId: number, activa: boolean): Promise<Persona | null> {
  const id = esquemaId.parse(personaId);

  const { rows } = await query<FilaPersona>(
    `UPDATE traza.persona
        SET activa = $2
      WHERE id = $1
      RETURNING ${COLUMNAS_PERSONA_RETURNING}`,
    [id, activa],
  );
  return rows[0] ? filaAPersona(rows[0]) : null;
}

export function activarPersona(personaId: number): Promise<Persona | null> {
  return marcarPersona(personaId, true);
}

export function desactivarPersona(personaId: number): Promise<Persona | null> {
  return marcarPersona(personaId, false);
}

export type PagosPersona = {
  personaId: number;
  nombre: string;
  categoria: CategoriaPersona;
  activa: boolean;
  
  vales: number;
  
  totalPagado: string;
  ultimoPago: string | null;
};

export async function pagosPorPersona(): Promise<PagosPersona[]> {
  const { rows } = await query<{
    persona_id: string | number;
    nombre: string;
    categoria: string;
    activa: boolean;
    vales: string | number;
    total_pagado: string;
    ultimo_pago: Date | string | null;
  }>(
    `SELECT v.persona_id,
            v.nombre,
            v.categoria,
            v.activa,
            v.vales,
            v.total_pagado::text AS total_pagado,
            v.ultimo_pago
       FROM traza.v_pagos_por_persona v
      ORDER BY v.total_pagado DESC, v.nombre`,
  );

  return rows.map((fila) => ({
    personaId: aNumero(fila.persona_id),
    nombre: fila.nombre,
    categoria: fila.categoria as CategoriaPersona,
    activa: fila.activa,
    vales: aNumero(fila.vales),
    totalPagado: aImporte(fila.total_pagado),
    ultimoPago: aIsoOpcional(fila.ultimo_pago),
  }));
}

export type Socio = PosicionSocio & {
  personaId: number;
  nombre: string;
  
  usuarioId: number | null;
  
  participacionPct: string | null;
  activo: boolean;
  
  actaReferencia: string;
  fechaAlta: string;
  fechaBaja: string | null;
};

type FilaSocio = {
  socio_persona_id: string | number;
  socio_nombre: string;
  socio_usuario_id: string | number | null;
  participacion_pct: string | null;
  activo: boolean;
  total_anticipos: string;
  total_repartido: string;
  acta_referencia: string;
  fecha_alta: string;
  fecha_baja: string | null;
};

const SELECT_SOCIO = `
  SELECT a.socio_persona_id,
         a.socio_nombre,
         a.socio_usuario_id,
         a.participacion_pct::text AS participacion_pct,
         a.activo,
         a.total_anticipos::text AS total_anticipos,
         a.total_repartido::text AS total_repartido,
         s.acta_referencia,
         s.fecha_alta::text AS fecha_alta,
         s.fecha_baja::text AS fecha_baja
    FROM traza.v_anticipo_utilidades_socio a
    JOIN traza.socio s ON s.persona_id = a.socio_persona_id`;

function filaASocio(fila: FilaSocio): Socio {
  const posicion = posicionSocio({
    totalAnticipos: fila.total_anticipos,
    totalRepartido: fila.total_repartido,
  });

  
  if (!posicion) {
    throw new Error(`No se pudo interpretar la posición de anticipos del socio ${fila.socio_nombre}`);
  }

  return {
    ...posicion,
    personaId: aNumero(fila.socio_persona_id),
    nombre: fila.socio_nombre,
    usuarioId: aNumeroOpcional(fila.socio_usuario_id),
    participacionPct: fila.participacion_pct,
    activo: fila.activo,
    actaReferencia: fila.acta_referencia,
    fechaAlta: fila.fecha_alta,
    fechaBaja: fila.fecha_baja,
  };
}

export const esquemaFiltroSocios = z.object({
  
  soloActivos: z.boolean().default(true),
});

export type FiltroSocios = z.input<typeof esquemaFiltroSocios>;

export async function listarSocios(filtro: FiltroSocios = {}): Promise<Socio[]> {
  const { soloActivos } = esquemaFiltroSocios.parse(filtro);

  const { rows } = await query<FilaSocio>(
    `${SELECT_SOCIO}
      WHERE (NOT $1::boolean OR a.activo)
      ORDER BY a.saldo_por_comprobar DESC, a.socio_nombre`,
    [soloActivos],
  );
  return rows.map(filaASocio);
}

export const esquemaRegistrarSocio = z.object({
  
  personaId: esquemaId,
  participacionPct: esquemaParticipacion,
  
  actaReferencia: z
    .string()
    .trim()
    .min(3, "Cita el acta o el instrumento que lo acredita como socio")
    .max(200),
  
  fechaAlta: esquemaFechaIso.optional(),
});

export type EntradaRegistrarSocio = z.input<typeof esquemaRegistrarSocio>;

export async function registrarSocio(
  entrada: EntradaRegistrarSocio,
  usuario: number,
): Promise<Socio | null> {
  const datos = esquemaRegistrarSocio.parse(entrada);
  const usuarioId = esquemaId.parse(usuario);

  const { rows } = await query<{ persona_id: string | number }>(
    `INSERT INTO traza.socio
       (persona_id, participacion_pct, acta_referencia, fecha_alta, creado_por)
     VALUES ($1, $2, $3, COALESCE($4::date, current_date), $5)
     ON CONFLICT (persona_id) DO UPDATE
        SET participacion_pct = EXCLUDED.participacion_pct,
            acta_referencia   = EXCLUDED.acta_referencia,
            fecha_alta        = EXCLUDED.fecha_alta,
            fecha_baja        = NULL,
            creado_por        = EXCLUDED.creado_por,
            creado_en         = now()
      WHERE socio.fecha_baja IS NOT NULL
      RETURNING persona_id`,
    [
      datos.personaId,
      datos.participacionPct,
      datos.actaReferencia,
      datos.fechaAlta ?? null,
      usuarioId,
    ],
  );

  if (!rows[0]) return null;
  return obtenerSocio(aNumero(rows[0].persona_id));
}

export async function obtenerSocio(personaId: number): Promise<Socio | null> {
  const id = esquemaId.parse(personaId);

  const { rows } = await query<FilaSocio>(`${SELECT_SOCIO} WHERE a.socio_persona_id = $1`, [id]);
  return rows[0] ? filaASocio(rows[0]) : null;
}

export const esquemaDarDeBajaSocio = z.object({
  
  fechaBaja: esquemaFechaIso.optional(),
});

export type EntradaDarDeBajaSocio = z.input<typeof esquemaDarDeBajaSocio>;

export async function darDeBajaSocio(
  personaId: number,
  entrada: EntradaDarDeBajaSocio = {},
): Promise<Socio | null> {
  const id = esquemaId.parse(personaId);
  const { fechaBaja } = esquemaDarDeBajaSocio.parse(entrada);

  await query(
    `UPDATE traza.socio
        SET fecha_baja = COALESCE($2::date, current_date)
      WHERE persona_id = $1
        AND fecha_baja IS NULL`,
    [id, fechaBaja ?? null],
  );

  return obtenerSocio(id);
}

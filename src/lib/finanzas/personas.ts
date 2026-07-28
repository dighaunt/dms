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

/**
 * Catálogo de personas y registro formal de socios (migración 040).
 *
 * DOS COSAS DISTINTAS QUE AQUÍ CONVIVEN.
 *
 * `persona` es a quién se le paga o de quién se recibe de forma recurrente. Su
 * razón de ser es poder SUMAR: mientras el beneficiario de un vale fue texto
 * libre, "Refaccionaria del Norte" y "Refaccionaria del Nte." eran dos
 * proveedores para el sistema y ninguno tenía historial. El texto libre no
 * desaparece —a veces se le paga a alguien una sola vez en la vida y darlo de
 * alta sería un estorbo—; lo que se agrega es poder elegirlo.
 *
 * `socio` es quién tiene parte del capital social. NO se deriva de `usuario`:
 * en una agencia el accionista rara vez opera el DMS, y llenar el selector de
 * retiro de utilidades con todos los usuarios del sistema hacía dos cosas
 * malas a la vez —cargarle el anticipo a quien no era con un solo clic, y
 * entregar un "retiro de utilidades" a alguien que no tiene derecho a utilidad
 * alguna—. Por eso el socio se registra sobre la persona y con el acta que lo
 * acredita.
 *
 * LO QUE ESTA CAPA NO DECIDE. La suma de participaciones vigentes (que no pase
 * de 100) y la prohibición de que un socio dado de baja reciba un retiro viven
 * en disparadores plpgsql y llegan como P0001 con su mensaje en español. No se
 * atrapan ni se reescriben aquí: `responder` de "@/lib/finanzas/api" los
 * convierte en 409 con el texto del manual. Lo que sí se repite —el patrón del
 * RFC, los diez dígitos del teléfono, el par identificación completo— se
 * repite para poder avisar ANTES del viaje a la base, nunca para decidir en su
 * lugar.
 */

/**
 * El vocabulario de categorías vive en "@/lib/finanzas/tipos", que a
 * propósito NO lleva `server-only`: el formulario que da de alta a una persona
 * es una pantalla y tiene que poder dibujar el mismo selector del que esta
 * capa valida. Se reexporta para que quien ya habla con este servicio no tenga
 * que importar de dos lados.
 */
export {
  CATEGORIAS_PERSONA,
  ETIQUETA_CATEGORIA_PERSONA,
  esquemaCategoriaPersona,
  type CategoriaPersona,
} from "@/lib/finanzas/tipos";

// ===== HELPERS DE MAPEO =====

/** El driver entrega los bigint como cadena; aquí son número. */
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

/**
 * Canoniza un numeric(18,2) a la forma exacta de la columna. El dinero viaja
 * como cadena de principio a fin: un `number` de JavaScript ya redondea mal
 * cifras que la columna admite, y un centavo perdido es una diferencia de caja
 * que alguien tiene que explicar.
 */
function aImporte(valor: string | null | undefined): string {
  return deCentavos(aCentavos(valor ?? "0") ?? 0n);
}

// ===== ESQUEMAS DE APOYO =====

/**
 * Texto que el formulario deja en blanco cuando no aplica. La pantalla manda
 * "" para una casilla vacía y eso significa "sin dato", no una cadena vacía
 * que la base tendría que guardar como si fuera un valor.
 */
const textoOpcional = (maximo: number) =>
  z
    .string()
    .trim()
    .max(maximo)
    .nullish()
    .transform((valor) => (valor ? valor : null));

/**
 * RFC con homoclave. Mismo patrón que el CHECK de la columna. Se pasa a
 * mayúsculas antes de comparar porque quien captura lo escribe como venga en
 * la factura y eso no es un error suyo.
 */
const esquemaRfc = z
  .string()
  .trim()
  .toUpperCase()
  // La casilla vacía es "sin dato", no un RFC mal escrito: el catálogo admite
  // dar de alta a alguien con lo que se sabe hoy y completarlo después.
  .refine(
    (valor) => valor === "" || /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/.test(valor),
    "El RFC se escribe con 3 o 4 letras, la fecha en 6 dígitos y la homoclave, por ejemplo XAXX010101000",
  )
  .nullish()
  .transform((valor) => (valor ? valor : null));

/**
 * Teléfono a diez dígitos, como lo exige el CHECK.
 *
 * Se limpian espacios, guiones y paréntesis antes de comprobar: quien captura
 * copia "81 1234 5678" de una tarjeta y rechazarlo por la separación sería
 * pedirle que adivine un formato que el papel no usa. Lo que no se hace es
 * completar o recortar dígitos: eso ya sería inventar un teléfono.
 */
const esquemaTelefono = z
  .string()
  .transform((valor) => valor.replace(/[\s()-]/g, ""))
  .refine(
    (valor) => valor === "" || /^[0-9]{10}$/.test(valor),
    "El teléfono se captura a diez dígitos, con lada y sin el 01",
  )
  .nullish()
  .transform((valor) => (valor ? valor : null));

/**
 * Participación en el capital social. Viaja como cadena por la misma razón que
 * el dinero: es un `numeric(5,2)` y el reparto se calcula sobre ella.
 *
 * Se admite número por comodidad de la pantalla, pero se guarda y se devuelve
 * como texto. Que la suma de los socios vigentes no rebase 100 NO se comprueba
 * aquí —requiere leer a los demás socios en el mismo instante— sino en el
 * disparador `socio_participacion_coherente`.
 */
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

/**
 * Prepara un término para un LIKE. Sin esto, buscar "50%" traería el catálogo
 * completo y buscar "_" traería cualquier nombre de un carácter.
 */
function paraLike(termino: string): string {
  return termino.toLowerCase().replace(/([\\%_])/g, "\\$1");
}

// ===== CATÁLOGO DE PERSONAS =====

export type Persona = {
  id: number;
  nombre: string;
  /**
   * La identificación es opcional AQUÍ y obligatoria en el vale: se puede dar
   * de alta a un proveedor con lo que se sabe hoy y completarlo después, lo que
   * no se puede es pagarle sin identificarlo.
   */
  idTipo: string | null;
  idNumero: string | null;
  rfc: string | null;
  telefono: string | null;
  domicilio: string | null;
  categoria: CategoriaPersona;
  notas: string | null;
  /** Sólo cuando esa persona además opera el sistema. */
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

/** Las mismas, sin alias: un RETURNING no tiene tabla que calificar. */
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
  /** Parte del nombre. Sin acentos ni mayúsculas de por medio. */
  busqueda: z.string().trim().max(200).optional(),
  categoria: esquemaCategoriaPersona.optional(),
  /**
   * Verdadero por omisión: una captura nueva sólo debe poder elegir a quien
   * sigue dado de alta. La pantalla de administración lo pone en falso para
   * poder ver también a los dados de baja y reactivarlos.
   */
  soloActivas: z.boolean().default(true),
  /**
   * El tope existe porque quien llama esto suele ser un combobox que se
   * refresca en cada tecla, no una exportación.
   */
  limite: z.number().int().positive().max(500).default(50),
});

export type FiltroPersonas = z.input<typeof esquemaFiltroPersonas>;

/**
 * Personas del catálogo, para alimentar el buscador del beneficiario.
 *
 * La búsqueda es por nombre y sin distinguir mayúsculas: hay un índice sobre
 * `lower(nombre)` (`persona_por_nombre`) y por eso se compara contra esa misma
 * expresión y no con ILIKE, que no lo aprovecharía ni por prefijo.
 *
 * Se busca por SUBCADENA y no sólo por prefijo porque el nombre de un
 * proveedor casi nunca empieza por lo que uno recuerda de él ("Norte" en
 * "Refaccionaria del Norte"). Lo que sí se hace es subir los prefijos al
 * principio de la lista: quien teclea "ref" espera ver primero las
 * refaccionarias.
 */
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

/** Una persona por su id. Null si no existe. */
export async function obtenerPersona(personaId: number): Promise<Persona | null> {
  const id = esquemaId.parse(personaId);

  const { rows } = await query<FilaPersona>(
    `SELECT ${COLUMNAS_PERSONA} FROM traza.persona p WHERE p.id = $1`,
    [id],
  );
  return rows[0] ? filaAPersona(rows[0]) : null;
}

/**
 * Campos de la persona. La identificación va como par: el CHECK de la tabla
 * exige que el tipo y el número estén los dos o ninguno, porque "INE" sin
 * número no identifica a nadie y un número sin decir de qué documento tampoco.
 */
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
  /**
   * Usuario del sistema de esa misma persona, cuando lo tiene. Es opcional por
   * regla, no por comodidad: un proveedor o un accionista casi nunca opera el
   * DMS, y exigirle cuenta obligaría a inventar usuarios falsos para poder
   * pagarle.
   */
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

/**
 * Da de alta una persona.
 *
 * Dos personas no pueden compartir identificación: el índice único parcial
 * `persona_identificacion_unica` lo impide, y sin él el catálogo se llenaría de
 * duplicados y dejaría de servir justo para lo que se creó —saber cuánto se le
 * ha pagado a alguien—. Ese choque llega como 23505 y se traduce solo.
 *
 * `usuario` es quien da el alta y sale de la sesión, NUNCA del cuerpo de la
 * petición; no confundirlo con `usuarioId`, que es de quién es la ficha.
 */
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

/**
 * Corrige la ficha de una persona. Devuelve null si no existe.
 *
 * Se reciben TODOS los campos editables, no un parche: la pantalla manda el
 * formulario completo y un parche que interpretara la ausencia de un campo
 * como "déjalo igual" haría imposible borrar un dato mal capturado —el
 * teléfono equivocado de un proveedor se quedaría ahí para siempre—.
 *
 * Corregir el nombre aquí NO cambia lo que dice un vale ya emitido: el
 * documento guarda el nombre y la identificación como texto, que es la foto de
 * lo que alguien firmó. Ése es exactamente el motivo de que el vale conserve
 * las dos cosas, el texto y el enlace.
 *
 * `activa` no se toca por esta vía: darla de baja o reactivarla es un acto
 * propio y tiene sus funciones.
 */
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

/**
 * Da de baja o reactiva a una persona. Devuelve null si no existe.
 *
 * Dar de baja NO borra ni oculta nada: los vales que la citan siguen citándola
 * y `v_pagos_por_persona` la sigue sumando. Lo único que cambia es que deja de
 * ofrecerse en las capturas nuevas. Borrarla sería imposible de todas formas
 * —la referencian los vales y, si es socio, el registro de socios— y perdería
 * el historial de pagos, que es la razón de que el catálogo exista.
 */
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

// ===== LO QUE SE LE HA PAGADO A CADA PERSONA =====

export type PagosPersona = {
  personaId: number;
  nombre: string;
  categoria: CategoriaPersona;
  activa: boolean;
  /** Vales FIRMADOS a su nombre: los únicos que movieron dinero. */
  vales: number;
  /** Cadena, nunca number: numeric(18,2) no cabe sin perder centavos. */
  totalPagado: string;
  ultimoPago: string | null;
};

/**
 * Cuánto se le ha pagado a cada persona del catálogo, del que más ha cobrado
 * al que menos.
 *
 * Es la razón de ser del catálogo: poder sumar. La vista sólo cuenta vales
 * FIRMADOS —un borrador no entregó dinero— e incluye a quien no ha cobrado
 * nunca, porque un listado que sólo enumera a los que ya cobraron no deja ver
 * al proveedor dado de alta que nadie ha pagado.
 */
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

// ===== REGISTRO DE SOCIOS =====

/**
 * Un socio con su posición frente al reparto formal.
 *
 * La ETIQUETA del saldo la pone `posicionSocio`, igual que en la pantalla de
 * egresos y en el reporte: mientras no exista un reparto que lo respalde, lo
 * retirado es anticipo a cuenta —saldo por comprobar— y nunca gasto cerrado
 * (LGSM art. 19). Que esa frase se redacte en un solo lugar es lo que impide
 * que dos pantallas llamen cosas distintas al mismo dinero.
 */
export type Socio = PosicionSocio & {
  personaId: number;
  nombre: string;
  /** Sólo si ese socio además opera el sistema. Casi nunca. */
  usuarioId: number | null;
  /** Cadena: es un numeric(5,2) y el reparto se calcula sobre él. */
  participacionPct: string | null;
  activo: boolean;
  /** El documento que lo acredita como accionista. */
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

/**
 * La posición viene de la vista y el acta y las fechas de la tabla: la vista
 * responde "cuánto debe", el registro responde "con qué documento se acredita".
 * Las fechas se piden como texto porque el driver convertiría una columna
 * `date` en un Date a medianoche local y la fecha de un acta no cambia según
 * dónde corra el proceso.
 */
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

  // La vista entrega numeric(18,2), así que esto no ocurre. Si ocurriera,
  // callarlo sería omitir de la lista a un socio con dinero por comprobar.
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
  /**
   * Verdadero por omisión: el selector de un retiro de utilidades sólo puede
   * ofrecer socios vigentes, y el disparador `vale_exige_socio_vigente` lo
   * impone de todas formas. La pantalla del registro lo pone en falso para ver
   * también a los que ya salieron.
   */
  soloActivos: z.boolean().default(true),
});

export type FiltroSocios = z.input<typeof esquemaFiltroSocios>;

/**
 * El registro de socios con la posición de cada uno.
 *
 * Salen TODOS los registrados, incluidos los de saldo cero: antes la vista
 * partía de quien ya tenía movimiento y un socio recién dado de alta no
 * existía para el sistema hasta que retiraba dinero. Un tablero que sólo
 * enumera a los que deben no deja ver a quien no ha recibido nada.
 *
 * Primero los saldos mayores, que es el orden en que un gerente los necesita.
 */
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
  /** La persona debe existir en el catálogo: un socio es una persona. */
  personaId: esquemaId,
  participacionPct: esquemaParticipacion,
  /**
   * Sin acta no hay socio. No es papeleo: quien no puede acreditarse como
   * accionista no tiene por qué poder retirar utilidades a cuenta de nada, y
   * quien autoriza el retiro necesita poder citar contra qué documento lo hizo.
   */
  actaReferencia: z
    .string()
    .trim()
    .min(3, "Cita el acta o el instrumento que lo acredita como socio")
    .max(200),
  /** Se omite para el día de hoy. Sirve para asentar un alta anterior. */
  fechaAlta: esquemaFechaIso.optional(),
});

export type EntradaRegistrarSocio = z.input<typeof esquemaRegistrarSocio>;

/**
 * Registra a una persona como socio.
 *
 * Devuelve null cuando esa persona YA figura como socio vigente: no se
 * sobreescribe su acta ni su participación por esta vía, porque hacerlo
 * cambiaría en silencio con qué documento se acredita a un accionista. Sí se
 * admite volver a registrar a quien fue dado de baja —un socio puede
 * reingresar—, y entonces el alta queda asentada con el acta nueva.
 *
 * Que la participación no rebase el 100 por ciento entre todos los vigentes lo
 * impone `socio_participacion_coherente`, que necesita mirar a los demás
 * socios en el mismo instante y por eso no se puede adelantar aquí; llega como
 * P0001 y se propaga tal cual.
 */
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

/** Un socio por el id de su persona. Null si esa persona no está registrada. */
export async function obtenerSocio(personaId: number): Promise<Socio | null> {
  const id = esquemaId.parse(personaId);

  const { rows } = await query<FilaSocio>(`${SELECT_SOCIO} WHERE a.socio_persona_id = $1`, [id]);
  return rows[0] ? filaASocio(rows[0]) : null;
}

export const esquemaDarDeBajaSocio = z.object({
  /** Se omite para el día de hoy. La base exige que no sea anterior al alta. */
  fechaBaja: esquemaFechaIso.optional(),
});

export type EntradaDarDeBajaSocio = z.input<typeof esquemaDarDeBajaSocio>;

/**
 * Asienta la salida de un socio. Devuelve null si esa persona no está
 * registrada como socio.
 *
 * La baja no borra nada: sus retiros siguen ahí y su saldo por comprobar sigue
 * contando, que es justo lo que un socio que se va deja pendiente. Lo que
 * cambia es que `exigir_socio_vigente` deja de admitir retiros a su nombre.
 *
 * El WHERE exige que siga vigente: dar de baja dos veces movería la fecha de
 * salida ya asentada, y eso es reescribir un hecho. Si ya estaba dado de baja
 * se devuelve tal como quedó, con su fecha original.
 */
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

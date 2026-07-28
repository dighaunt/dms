import "server-only";

import { z } from "zod";

import { query } from "@/lib/db";
import {
  esquemaClaveSucursal,
  esquemaId,
  esquemaPinFirma,
  type Empleado,
  type Sucursal,
} from "@/lib/finanzas/tipos";

/**
 * Catálogos de administración del módulo de Finanzas: sucursales, personal,
 * conceptos de cobro y de egreso, formas de pago y el PIN de firma.
 *
 * Ninguno de estos es un enum. El manual encarga al administrador del sistema
 * mantenerlos, y una unión cerrada en TypeScript convertiría el alta de un
 * concepto nuevo en un despliegue. Quien decide si un código existe es la
 * llave foránea del catálogo, no esta capa.
 *
 * Los candados siguen viviendo en el esquema: la clave de sucursal con su
 * patrón, el largo del nombre, el par (sucursal, número de empleado) único, el
 * rango del PIN. Aquí se validan las mismas cosas para poder decírselo a quien
 * captura ANTES de ir a la base, nunca para decidir en su lugar. Lo que la base
 * rechace llega como P0001 o como violación de restricción y se propaga tal
 * cual: `respuestaError` de "@/lib/api" lo traduce.
 */

// ===== HELPERS DE MAPEO =====

/** El driver entrega los bigint como cadena; aquí son número. */
function aNumero(valor: string | number): number {
  return typeof valor === "number" ? valor : Number(valor);
}

function aNumeroOpcional(valor: string | number | null | undefined): number | null {
  return valor === null || valor === undefined ? null : aNumero(valor);
}

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
 * Código de un catálogo administrable. Es el MISMO patrón con el que
 * "@/lib/finanzas/egresos" valida el concepto que le llega de la pantalla: si
 * aquí se admitiera un código que allá se rechaza, el administrador podría dar
 * de alta un concepto que ningún vale puede usar.
 */
const esquemaCodigoCatalogo = z
  .string()
  .transform((valor) => valor.trim().toUpperCase())
  .refine(
    (valor) => /^[A-Z_]{2,40}$/.test(valor),
    "El código de catálogo se escribe con letras mayúsculas y guiones bajos",
  );

const esquemaEtiquetaCatalogo = z
  .string()
  .trim()
  .min(3, "La etiqueta debe tener al menos 3 caracteres")
  .max(160);

/**
 * Posición del renglón en el selector. La columna es `smallint UNIQUE`; se
 * deja omitir para que el alta corriente no obligue a averiguar qué números
 * están ocupados.
 */
const esquemaOrdenCatalogo = z
  .number()
  .int("El orden debe ser un número entero")
  .positive("El orden debe ser mayor que cero")
  .max(32767)
  .nullish();

// ===== SUCURSALES =====

type FilaSucursal = {
  id: string | number;
  clave: string;
  nombre: string;
  activa: boolean;
  zona_horaria: string;
};

function filaASucursal(fila: FilaSucursal): Sucursal {
  return {
    id: aNumero(fila.id),
    clave: fila.clave,
    nombre: fila.nombre,
    activa: fila.activa,
    zonaHoraria: fila.zona_horaria,
  };
}

const SELECT_SUCURSAL =
  `SELECT s.id, s.clave, s.nombre, s.activa, s.zona_horaria FROM traza.sucursal s`;

/**
 * Zona con la que se decide a qué día pertenece un cobro.
 *
 * Es la del cajón, no la del servidor. Un cobro de las 19:00 en Monterrey
 * pertenece al corte de ese día aunque en UTC ya sea el siguiente, y si la
 * frontera se calculara con el reloj del proceso, el efectivo estaría en la
 * caja hoy y el corte de hoy no lo contaría. México tiene tres husos vigentes,
 * así que una constante no basta: es un dato de cada agencia.
 *
 * La base valida contra el catálogo IANA del servidor; esta lista sólo ofrece
 * los usos del país para no obligar a teclear el nombre exacto.
 */
export const ZONAS_HORARIAS_MEXICO = [
  { valor: "America/Mexico_City", etiqueta: "Centro (Ciudad de México, Monterrey, Guadalajara)" },
  { valor: "America/Chihuahua", etiqueta: "Pacífico (Chihuahua)" },
  { valor: "America/Hermosillo", etiqueta: "Sonora (Hermosillo)" },
  { valor: "America/Tijuana", etiqueta: "Noroeste (Tijuana, Mexicali)" },
  { valor: "America/Cancun", etiqueta: "Sureste (Cancún, Quintana Roo)" },
] as const;

export const ZONA_HORARIA_POR_OMISION = "America/Mexico_City";

const esquemaZonaHoraria = z
  .string()
  .trim()
  .min(3)
  .max(64)
  .default(ZONA_HORARIA_POR_OMISION);

export const esquemaFiltroSucursales = z.object({
  /**
   * Verdadero por omisión: quien abre un selector para emitir un folio sólo
   * puede elegir entre las que siguen operando. La pantalla de administración
   * lo pone en falso para poder ver también las dadas de baja.
   */
  soloActivas: z.boolean().default(true),
});

export type FiltroSucursales = z.input<typeof esquemaFiltroSucursales>;

/** Sucursales ordenadas por clave, que es como se citan en los folios. */
export async function listarSucursales(filtro: FiltroSucursales = {}): Promise<Sucursal[]> {
  const { soloActivas } = esquemaFiltroSucursales.parse(filtro);

  const { rows } = await query<FilaSucursal>(
    `${SELECT_SUCURSAL}
      WHERE (NOT $1::boolean OR s.activa)
      ORDER BY s.clave`,
    [soloActivas],
  );
  return rows.map(filaASucursal);
}

export async function obtenerSucursal(sucursalId: number): Promise<Sucursal | null> {
  const id = esquemaId.parse(sucursalId);
  const { rows } = await query<FilaSucursal>(`${SELECT_SUCURSAL} WHERE s.id = $1`, [id]);
  return rows[0] ? filaASucursal(rows[0]) : null;
}

export const esquemaCrearSucursal = z.object({
  clave: esquemaClaveSucursal,
  nombre: z
    .string()
    .trim()
    .min(3, "El nombre de la sucursal debe tener al menos 3 caracteres")
    .max(120),
  /**
   * Determina a qué día pertenece cada cobro de esta agencia. Se puede
   * corregir después: es lo único de la sucursal que sí cambia si la agencia
   * se muda, y cada corte guarda la que se usó para armarlo.
   */
  zonaHoraria: esquemaZonaHoraria,
  /** Id del usuario de sesión. Jamás se acepta del cuerpo de la petición. */
  usuario: esquemaId,
});

export type EntradaCrearSucursal = z.input<typeof esquemaCrearSucursal>;

/**
 * Da de alta una sucursal.
 *
 * La clave no es un adorno del encabezado: el folio corre por sucursal y por
 * tipo, así que la clave forma parte de la identidad del documento
 * (CACM-RCI-01-MTY-0001) y se conserva impresa en todo lo ya emitido. Por eso
 * no hay función para cambiarla: hacerlo reescribiría la cita de folios que ya
 * circulan en papel.
 */
export async function crearSucursal(entrada: EntradaCrearSucursal): Promise<Sucursal> {
  const datos = esquemaCrearSucursal.parse(entrada);

  const { rows } = await query<FilaSucursal>(
    `INSERT INTO traza.sucursal (clave, nombre, zona_horaria, creada_por)
     VALUES ($1, $2, $3, $4)
     RETURNING id, clave, nombre, activa, zona_horaria`,
    [datos.clave, datos.nombre, datos.zonaHoraria, datos.usuario],
  );
  return filaASucursal(rows[0]);
}

/**
 * Da de baja o reactiva una sucursal. Devuelve null si no existe.
 *
 * Dar de baja NO borra ni oculta nada: los folios ya emitidos siguen citándola
 * y el histórico se lee igual. Lo único que cambia es que
 * `emitir_folio_financiero` deja de aceptarla, así que no se abren folios
 * nuevos en una agencia que ya cerró. Borrarla sería imposible de todas formas
 * —la referencian los documentos, los contadores y el personal— y además
 * dejaría huecos inexplicables en consecutivos que deben ser continuos.
 */
async function marcarSucursal(sucursalId: number, activa: boolean): Promise<Sucursal | null> {
  const id = esquemaId.parse(sucursalId);

  const { rows } = await query<FilaSucursal>(
    `UPDATE traza.sucursal
        SET activa = $2
      WHERE id = $1
      RETURNING id, clave, nombre, activa, zona_horaria`,
    [id, activa],
  );
  return rows[0] ? filaASucursal(rows[0]) : null;
}

/**
 * Corrige la zona horaria de una sucursal.
 *
 * A diferencia de la clave, ésta sí se puede cambiar: una agencia se muda y su
 * día cambia de frontera. Los cortes ya armados NO se recalculan —guardan la
 * zona con la que se armaron, que es el hecho histórico— y un nombre que no
 * exista en el catálogo IANA lo rechaza la base con su propio mensaje.
 */
export async function fijarZonaHorariaSucursal(
  sucursalId: number,
  zonaHoraria: string,
): Promise<Sucursal | null> {
  const id = esquemaId.parse(sucursalId);
  const zona = esquemaZonaHoraria.parse(zonaHoraria);

  const { rows } = await query<FilaSucursal>(
    `UPDATE traza.sucursal
        SET zona_horaria = $2
      WHERE id = $1
      RETURNING id, clave, nombre, activa, zona_horaria`,
    [id, zona],
  );
  return rows[0] ? filaASucursal(rows[0]) : null;
}

export function activarSucursal(sucursalId: number): Promise<Sucursal | null> {
  return marcarSucursal(sucursalId, true);
}

export function desactivarSucursal(sucursalId: number): Promise<Sucursal | null> {
  return marcarSucursal(sucursalId, false);
}

// ===== EMPLEADOS =====

type FilaEmpleado = {
  id: string | number;
  num_empleado: string;
  nombre: string;
  puesto: string | null;
  sucursal_id: string | number;
  usuario_id: string | number | null;
  activo: boolean;
};

function filaAEmpleado(fila: FilaEmpleado): Empleado {
  return {
    id: aNumero(fila.id),
    numEmpleado: fila.num_empleado,
    nombre: fila.nombre,
    puesto: fila.puesto,
    sucursalId: aNumero(fila.sucursal_id),
    usuarioId: aNumeroOpcional(fila.usuario_id),
    activo: fila.activo,
  };
}

const SELECT_EMPLEADO = `
  SELECT e.id,
         e.num_empleado,
         e.nombre,
         e.puesto,
         e.sucursal_id,
         e.usuario_id,
         e.activo
    FROM traza.empleado e`;

export const esquemaFiltroEmpleados = z.object({
  /** Omitirla lista el personal de todas las sucursales. */
  sucursalId: esquemaId.optional(),
  soloActivos: z.boolean().default(true),
});

export type FiltroEmpleados = z.input<typeof esquemaFiltroEmpleados>;

/**
 * Personal de una sucursal, ordenado por nombre.
 *
 * El catálogo es independiente del de usuarios: el trabajador que cobra un
 * recibo de nómina o el vendedor que aparece en un RCI-01 no tiene por qué
 * operar el sistema. `usuarioId` sólo existe cuando además lo hace.
 */
export async function listarEmpleados(filtro: FiltroEmpleados = {}): Promise<Empleado[]> {
  const { sucursalId, soloActivos } = esquemaFiltroEmpleados.parse(filtro);

  const { rows } = await query<FilaEmpleado>(
    `${SELECT_EMPLEADO}
      WHERE ($1::bigint IS NULL OR e.sucursal_id = $1)
        AND (NOT $2::boolean OR e.activo)
      ORDER BY e.sucursal_id, e.nombre`,
    [sucursalId ?? null, soloActivos],
  );
  return rows.map(filaAEmpleado);
}

export const esquemaCrearEmpleado = z.object({
  numEmpleado: z
    .string()
    .trim()
    .min(1, "Captura el número de empleado")
    .max(20),
  nombre: z
    .string()
    .trim()
    .min(3, "El nombre debe tener al menos 3 caracteres")
    .max(160),
  puesto: textoOpcional(80),
  sucursalId: esquemaId,
  /**
   * Usuario del sistema de esa misma persona, cuando lo tiene. Se enlaza para
   * que quien firma con su PIN y quien aparece como vendedor en el recibo sean
   * reconociblemente el mismo; la base lo declara UNIQUE, así que un usuario
   * no puede quedar colgado de dos fichas de personal.
   */
  usuarioId: esquemaId.nullish(),
  /** Id del usuario de sesión que da el alta. */
  usuario: esquemaId,
});

export type EntradaCrearEmpleado = z.input<typeof esquemaCrearEmpleado>;

export async function crearEmpleado(entrada: EntradaCrearEmpleado): Promise<Empleado> {
  const datos = esquemaCrearEmpleado.parse(entrada);

  const { rows } = await query<FilaEmpleado>(
    `INSERT INTO traza.empleado
       (num_empleado, nombre, puesto, sucursal_id, usuario_id, creado_por)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, num_empleado, nombre, puesto, sucursal_id, usuario_id, activo`,
    [
      datos.numEmpleado,
      datos.nombre,
      datos.puesto,
      datos.sucursalId,
      datos.usuarioId ?? null,
      datos.usuario,
    ],
  );
  return filaAEmpleado(rows[0]);
}

// ===== CONCEPTOS Y FORMAS DE PAGO =====

/**
 * Los códigos se declaran como `string` y no como uniones cerradas: son
 * catálogos que el administrador amplía sin tocar código, y una unión los
 * congelaría en el momento del despliegue.
 */
export type ConceptoCobro = {
  codigo: string;
  etiqueta: string;
  orden: number;
  activo: boolean;
};

export type ConceptoEgreso = ConceptoCobro & {
  /**
   * Marca el renglón del que habla la regla del manual: el retiro de un socio
   * NO es utilidad repartida sino anticipo a cuenta, hasta que exista un
   * balance formal que respalde el reparto (LGSM art. 19).
   */
  esAnticipoUtilidades: boolean;
};

export type FormaPago = {
  codigo: string;
  etiqueta: string;
  orden: number;
  /** Si mueve el efectivo del cajón, y por lo tanto entra al corte diario. */
  afectaCajaFisica: boolean;
  activo: boolean;
};

export const esquemaFiltroCatalogo = z.object({
  /**
   * Por omisión sólo lo vigente: un concepto dado de baja no debe poder
   * elegirse en una captura nueva, aunque siga citado por los folios viejos.
   */
  soloActivos: z.boolean().default(true),
});

export type FiltroCatalogo = z.input<typeof esquemaFiltroCatalogo>;

export async function conceptosCobro(filtro: FiltroCatalogo = {}): Promise<ConceptoCobro[]> {
  const { soloActivos } = esquemaFiltroCatalogo.parse(filtro);

  const { rows } = await query<ConceptoCobro>(
    `SELECT c.codigo, c.etiqueta, c.orden, c.activo
       FROM traza.concepto_cobro c
      WHERE (NOT $1::boolean OR c.activo)
      ORDER BY c.orden`,
    [soloActivos],
  );
  return rows;
}

export async function conceptosEgreso(filtro: FiltroCatalogo = {}): Promise<ConceptoEgreso[]> {
  const { soloActivos } = esquemaFiltroCatalogo.parse(filtro);

  const { rows } = await query<{
    codigo: string;
    etiqueta: string;
    orden: number;
    es_anticipo_utilidades: boolean;
    activo: boolean;
  }>(
    `SELECT c.codigo, c.etiqueta, c.orden, c.es_anticipo_utilidades, c.activo
       FROM traza.concepto_egreso c
      WHERE (NOT $1::boolean OR c.activo)
      ORDER BY c.orden`,
    [soloActivos],
  );

  return rows.map((fila) => ({
    codigo: fila.codigo,
    etiqueta: fila.etiqueta,
    orden: fila.orden,
    esAnticipoUtilidades: fila.es_anticipo_utilidades,
    activo: fila.activo,
  }));
}

export async function formasPago(filtro: FiltroCatalogo = {}): Promise<FormaPago[]> {
  const { soloActivos } = esquemaFiltroCatalogo.parse(filtro);

  const { rows } = await query<{
    codigo: string;
    etiqueta: string;
    orden: number;
    afecta_caja_fisica: boolean;
    activo: boolean;
  }>(
    `SELECT f.codigo, f.etiqueta, f.orden, f.afecta_caja_fisica, f.activo
       FROM traza.forma_pago_fin f
      WHERE (NOT $1::boolean OR f.activo)
      ORDER BY f.orden`,
    [soloActivos],
  );

  return rows.map((fila) => ({
    codigo: fila.codigo,
    etiqueta: fila.etiqueta,
    orden: fila.orden,
    afectaCajaFisica: fila.afecta_caja_fisica,
    activo: fila.activo,
  }));
}

export const esquemaCrearConceptoCobro = z.object({
  codigo: esquemaCodigoCatalogo,
  etiqueta: esquemaEtiquetaCatalogo,
  orden: esquemaOrdenCatalogo,
});

export type EntradaCrearConceptoCobro = z.input<typeof esquemaCrearConceptoCobro>;

/**
 * Alta de un concepto de cobro.
 *
 * Cuando no se indica el orden se toma el siguiente libre dentro del mismo
 * INSERT. Dos altas simultáneas pueden calcular el mismo número y una de las
 * dos chocará contra el UNIQUE de la columna: eso es correcto —el catálogo no
 * admite dos renglones en la misma posición— y llega a la pantalla como un
 * "ya existe un registro con esos datos" que se resuelve reintentando.
 */
export async function crearConceptoCobro(
  entrada: EntradaCrearConceptoCobro,
): Promise<ConceptoCobro> {
  const datos = esquemaCrearConceptoCobro.parse(entrada);

  const { rows } = await query<ConceptoCobro>(
    `INSERT INTO traza.concepto_cobro (codigo, etiqueta, orden)
     VALUES ($1, $2,
             COALESCE($3::smallint,
                      (SELECT COALESCE(max(orden), 0) + 1 FROM traza.concepto_cobro)))
     RETURNING codigo, etiqueta, orden, activo`,
    [datos.codigo, datos.etiqueta, datos.orden ?? null],
  );
  return rows[0];
}

export const esquemaCrearConceptoEgreso = z.object({
  codigo: esquemaCodigoCatalogo,
  etiqueta: esquemaEtiquetaCatalogo,
  orden: esquemaOrdenCatalogo,
  /**
   * Falso por omisión. Marcarlo cambia cómo se presenta el dinero que sale por
   * ese concepto: deja de ser gasto cerrado y pasa a ser saldo por comprobar
   * del socio, y levanta la alerta de retiro sin respaldo. No es una etiqueta
   * cosmética, así que se declara explícitamente en el alta.
   */
  esAnticipoUtilidades: z.boolean().default(false),
});

export type EntradaCrearConceptoEgreso = z.input<typeof esquemaCrearConceptoEgreso>;

export async function crearConceptoEgreso(
  entrada: EntradaCrearConceptoEgreso,
): Promise<ConceptoEgreso> {
  const datos = esquemaCrearConceptoEgreso.parse(entrada);

  const { rows } = await query<{
    codigo: string;
    etiqueta: string;
    orden: number;
    es_anticipo_utilidades: boolean;
    activo: boolean;
  }>(
    `INSERT INTO traza.concepto_egreso (codigo, etiqueta, orden, es_anticipo_utilidades)
     VALUES ($1, $2,
             COALESCE($3::smallint,
                      (SELECT COALESCE(max(orden), 0) + 1 FROM traza.concepto_egreso)),
             $4)
     RETURNING codigo, etiqueta, orden, es_anticipo_utilidades, activo`,
    [datos.codigo, datos.etiqueta, datos.orden ?? null, datos.esAnticipoUtilidades],
  );

  const fila = rows[0];
  return {
    codigo: fila.codigo,
    etiqueta: fila.etiqueta,
    orden: fila.orden,
    esAnticipoUtilidades: fila.es_anticipo_utilidades,
    activo: fila.activo,
  };
}

export const esquemaCrearFormaPago = z.object({
  codigo: esquemaCodigoCatalogo,
  etiqueta: esquemaEtiquetaCatalogo,
  orden: esquemaOrdenCatalogo,
  /**
   * Sin valor por omisión a propósito. Es la bandera que decide qué entra al
   * arqueo del corte diario: declarar como efectivo una forma que nunca pasa
   * por el cajón haría que el corte exigiera contar dinero que no está ahí y
   * levantaría un faltante todos los días. Quien da de alta la forma tiene que
   * responder esa pregunta.
   */
  afectaCajaFisica: z.boolean(),
});

export type EntradaCrearFormaPago = z.input<typeof esquemaCrearFormaPago>;

export async function crearFormaPago(entrada: EntradaCrearFormaPago): Promise<FormaPago> {
  const datos = esquemaCrearFormaPago.parse(entrada);

  const { rows } = await query<{
    codigo: string;
    etiqueta: string;
    orden: number;
    afecta_caja_fisica: boolean;
    activo: boolean;
  }>(
    `INSERT INTO traza.forma_pago_fin (codigo, etiqueta, orden, afecta_caja_fisica)
     VALUES ($1, $2,
             COALESCE($3::smallint,
                      (SELECT COALESCE(max(orden), 0) + 1 FROM traza.forma_pago_fin)),
             $4)
     RETURNING codigo, etiqueta, orden, afecta_caja_fisica, activo`,
    [datos.codigo, datos.etiqueta, datos.orden ?? null, datos.afectaCajaFisica],
  );

  const fila = rows[0];
  return {
    codigo: fila.codigo,
    etiqueta: fila.etiqueta,
    orden: fila.orden,
    afectaCajaFisica: fila.afecta_caja_fisica,
    activo: fila.activo,
  };
}

// ===== PIN DE FIRMA =====

/**
 * Da de alta o cambia el PIN de firma de un usuario.
 *
 * El PIN en claro no se guarda ni se registra en NINGÚN lado. Lo único que
 * llega a la base es su hash bcrypt, calculado dentro de
 * `establecer_pin_firma`; aquí el valor sólo viaja como parámetro enlazado
 * ($2), nunca concatenado en el texto de la consulta, de modo que no puede
 * aparecer en un `statement` registrado por el servidor ni en el mensaje de
 * una excepción de Postgres.
 *
 * Por eso el PIN se valida SUELTO y no dentro del objeto de entrada: así el
 * valor nunca queda dentro de una estructura que otra capa pudiera serializar
 * a una bitácora. Los mensajes de error —el de aquí y el de la función SQL—
 * describen la regla ("entre 6 y 12 dígitos") y jamás el valor tecleado.
 *
 * `usuarioId` es de quién será el PIN, y lo decide la ruta: la sesión propia,
 * o un administrador dando de alta el de alguien más. Como toda escritura del
 * módulo, ese id NUNCA se toma del cuerpo de la petición.
 *
 * El rango lo impone `establecer_pin_firma`; `esquemaPinFirma` lo repite para
 * poder avisar antes del viaje, no para decidir en su lugar.
 */
export async function establecerPin(usuarioId: number, pin: string): Promise<void> {
  const id = esquemaId.parse(usuarioId);
  const pinValidado = esquemaPinFirma.parse(pin);

  await query(`SELECT traza.establecer_pin_firma($1, $2)`, [id, pinValidado]);
}

/** Verdadero si ese usuario ya puede firmar. Nunca devuelve el hash. */
export async function tienePinDeFirma(usuarioId: number): Promise<boolean> {
  const id = esquemaId.parse(usuarioId);
  const { rows } = await query<{ existe: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM traza.usuario_pin WHERE usuario_id = $1) AS existe`,
    [id],
  );
  return rows[0].existe;
}

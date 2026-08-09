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

function aNumero(valor: string | number): number {
  return typeof valor === "number" ? valor : Number(valor);
}

function aNumeroOpcional(valor: string | number | null | undefined): number | null {
  return valor === null || valor === undefined ? null : aNumero(valor);
}

const textoOpcional = (maximo: number) =>
  z
    .string()
    .trim()
    .max(maximo)
    .nullish()
    .transform((valor) => (valor ? valor : null));

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

const esquemaOrdenCatalogo = z
  .number()
  .int("El orden debe ser un número entero")
  .positive("El orden debe ser mayor que cero")
  .max(32767)
  .nullish();

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
  
  soloActivas: z.boolean().default(true),
});

export type FiltroSucursales = z.input<typeof esquemaFiltroSucursales>;

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
  
  zonaHoraria: esquemaZonaHoraria,
  
  usuario: esquemaId,
});

export type EntradaCrearSucursal = z.input<typeof esquemaCrearSucursal>;

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

type FilaEmpleado = {
  id: string | number;
  num_empleado: string;
  nombres: string;
  apellido_paterno: string;
  apellido_materno: string | null;
  nombre: string;
  departamento: string | null;
  puesto: string | null;
  sucursal_id: string | number;
  usuario_id: string | number | null;
  activo: boolean;
  baja_en: string | Date | null;
};

function filaAEmpleado(fila: FilaEmpleado): Empleado {
  return {
    id: aNumero(fila.id),
    numEmpleado: fila.num_empleado,
    nombres: fila.nombres,
    apellidoPaterno: fila.apellido_paterno,
    apellidoMaterno: fila.apellido_materno,
    nombre: fila.nombre,
    departamento: fila.departamento,
    puesto: fila.puesto,
    sucursalId: aNumero(fila.sucursal_id),
    usuarioId: aNumeroOpcional(fila.usuario_id),
    activo: fila.activo,
    bajaEn: fila.baja_en === null ? null : new Date(fila.baja_en).toISOString(),
  };
}

const COLUMNAS_EMPLEADO = `id, num_empleado, nombres, apellido_paterno, apellido_materno,
         nombre, departamento, puesto, sucursal_id, usuario_id, activo, baja_en`;

const SELECT_EMPLEADO = `
  SELECT e.id,
         e.num_empleado,
         e.nombres,
         e.apellido_paterno,
         e.apellido_materno,
         e.nombre,
         e.departamento,
         e.puesto,
         e.sucursal_id,
         e.usuario_id,
         e.activo,
         e.baja_en
    FROM traza.empleado e`;

export const esquemaFiltroEmpleados = z.object({
  
  sucursalId: esquemaId.optional(),
  soloActivos: z.boolean().default(true),
});

export type FiltroEmpleados = z.input<typeof esquemaFiltroEmpleados>;

export async function listarEmpleados(filtro: FiltroEmpleados = {}): Promise<Empleado[]> {
  const { sucursalId, soloActivos } = esquemaFiltroEmpleados.parse(filtro);

  const { rows } = await query<FilaEmpleado>(
    `${SELECT_EMPLEADO}
      WHERE ($1::bigint IS NULL OR e.sucursal_id = $1)
        AND (NOT $2::boolean OR e.activo)
      ORDER BY e.sucursal_id, e.apellido_paterno, e.apellido_materno NULLS FIRST, e.nombres`,
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
  
  nombres: z
    .string()
    .trim()
    .min(2, "Captura el nombre de pila")
    .max(80),
  apellidoPaterno: z
    .string()
    .trim()
    .min(2, "Captura el apellido paterno")
    .max(80),
  
  apellidoMaterno: textoOpcional(80),
  departamento: textoOpcional(80),
  puesto: textoOpcional(80),
  sucursalId: esquemaId,
  
  usuarioId: esquemaId.nullish(),
  
  usuario: esquemaId,
});

export type EntradaCrearEmpleado = z.input<typeof esquemaCrearEmpleado>;

export async function crearEmpleado(entrada: EntradaCrearEmpleado): Promise<Empleado> {
  const datos = esquemaCrearEmpleado.parse(entrada);

  const { rows } = await query<FilaEmpleado>(
    `INSERT INTO traza.empleado
       (num_empleado, nombres, apellido_paterno, apellido_materno, departamento,
        puesto, sucursal_id, usuario_id, creado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${COLUMNAS_EMPLEADO}`,
    [
      datos.numEmpleado,
      datos.nombres,
      datos.apellidoPaterno,
      datos.apellidoMaterno,
      datos.departamento,
      datos.puesto,
      datos.sucursalId,
      datos.usuarioId ?? null,
      datos.usuario,
    ],
  );
  return filaAEmpleado(rows[0]);
}

export const esquemaActualizarEmpleado = esquemaCrearEmpleado.omit({
  sucursalId: true,
  usuario: true,
});

export type EntradaActualizarEmpleado = z.input<typeof esquemaActualizarEmpleado>;

export async function actualizarEmpleado(
  empleadoId: number,
  entrada: EntradaActualizarEmpleado,
): Promise<Empleado | null> {
  const id = esquemaId.parse(empleadoId);
  const datos = esquemaActualizarEmpleado.parse(entrada);

  const { rows } = await query<FilaEmpleado>(
    `UPDATE traza.empleado
        SET num_empleado     = $2,
            nombres          = $3,
            apellido_paterno = $4,
            apellido_materno = $5,
            departamento     = $6,
            puesto           = $7,
            usuario_id       = $8
      WHERE id = $1
      RETURNING ${COLUMNAS_EMPLEADO}`,
    [
      id,
      datos.numEmpleado,
      datos.nombres,
      datos.apellidoPaterno,
      datos.apellidoMaterno,
      datos.departamento,
      datos.puesto,
      datos.usuarioId ?? null,
    ],
  );
  return rows[0] ? filaAEmpleado(rows[0]) : null;
}

async function marcarEmpleado(
  empleadoId: number,
  activo: boolean,
  usuario: number,
): Promise<Empleado | null> {
  const id = esquemaId.parse(empleadoId);
  const usuarioId = esquemaId.parse(usuario);

  const { rows } = await query<FilaEmpleado>(
    `SELECT ${COLUMNAS_EMPLEADO} FROM traza.cambiar_alta_empleado($1, $2, $3)`,
    [id, activo, usuarioId],
  );
  return rows[0] ? filaAEmpleado(rows[0]) : null;
}

export function activarEmpleado(empleadoId: number, usuario: number): Promise<Empleado | null> {
  return marcarEmpleado(empleadoId, true, usuario);
}

export function desactivarEmpleado(empleadoId: number, usuario: number): Promise<Empleado | null> {
  return marcarEmpleado(empleadoId, false, usuario);
}

export type ConceptoCobro = {
  codigo: string;
  etiqueta: string;
  orden: number;
  activo: boolean;
};

export type ConceptoEgreso = ConceptoCobro & {
  
  esAnticipoUtilidades: boolean;
};

export type FormaPago = {
  codigo: string;
  etiqueta: string;
  orden: number;
  
  afectaCajaFisica: boolean;
  activo: boolean;
};

export const esquemaFiltroCatalogo = z.object({
  
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

export async function establecerPin(usuarioId: number, pin: string): Promise<void> {
  const id = esquemaId.parse(usuarioId);
  const pinValidado = esquemaPinFirma.parse(pin);

  await query(`SELECT traza.establecer_pin_firma($1, $2)`, [id, pinValidado]);
}

export async function tienePinDeFirma(usuarioId: number): Promise<boolean> {
  const id = esquemaId.parse(usuarioId);
  const { rows } = await query<{ existe: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM traza.usuario_pin WHERE usuario_id = $1) AS existe`,
    [id],
  );
  return rows[0].existe;
}

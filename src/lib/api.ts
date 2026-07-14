import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { getUsuarioSesion, type UsuarioSesion } from "@/lib/auth/usuario";
import { query } from "@/lib/db";
import { TIPOS_LEGACY } from "@/lib/juego-documental";

export { TIPOS_LEGACY };

/**
 * Errores de negocio (RAISE EXCEPTION en las funciones de BD) → 409 con el
 * mensaje literal: son las reglas del manual explicadas y la UI las muestra
 * tal cual. Validación → 400. Nunca 500 silencioso.
 */
export function respuestaError(error: unknown): NextResponse {
  const pgError = error as { code?: string; message?: string; detail?: string };
  switch (pgError.code) {
    case "P0001": // raise_exception: candados del manual
      return NextResponse.json({ error: pgError.message }, { status: 409 });
    case "23505": // unique_violation (VIN duplicado, pago repetido, etc.)
      return NextResponse.json(
        { error: "Registro duplicado", detalle: pgError.detail ?? pgError.message },
        { status: 409 },
      );
    case "23503": // foreign_key_violation
    case "23514": // check_violation
    case "22P02": // invalid_text_representation
      return NextResponse.json(
        { error: "Datos inválidos", detalle: pgError.detail ?? pgError.message },
        { status: 400 },
      );
    default:
      console.error("Error no manejado en API:", error);
      return NextResponse.json(
        { error: "Error interno", detalle: pgError.message ?? String(error) },
        { status: 500 },
      );
  }
}

export function respuesta400(error: z.ZodError): NextResponse {
  return NextResponse.json(
    { error: "Validación fallida", detalles: error.issues },
    { status: 400 },
  );
}

export const respuesta401 = () =>
  NextResponse.json({ error: "Sesión requerida" }, { status: 401 });

export const respuesta404 = (mensaje = "No encontrado") =>
  NextResponse.json({ error: mensaje }, { status: 404 });

/** Valida el body con zod. Devuelve el dato o una respuesta 400 lista. */
export async function leerBody<Schema extends z.ZodType>(
  request: Request,
  schema: Schema,
): Promise<{ data: z.output<Schema>; error: null } | { data: null; error: NextResponse }> {
  let crudo: unknown;
  try {
    crudo = await request.json();
  } catch {
    return {
      data: null,
      error: NextResponse.json({ error: "Body JSON inválido" }, { status: 400 }),
    };
  }
  const parsed = schema.safeParse(crudo);
  if (!parsed.success) return { data: null, error: respuesta400(parsed.error) };
  return { data: parsed.data, error: null };
}

/** Exige sesión; el id del usuario de sesión es el que firma toda escritura. */
export async function requerirUsuario(): Promise<
  { usuario: UsuarioSesion; error: null } | { usuario: null; error: NextResponse }
> {
  const usuario = await getUsuarioSesion();
  if (!usuario) return { usuario: null, error: respuesta401() };
  return { usuario, error: null };
}

/** Exige sesión de administrador global (nivel N3). */
export async function requerirN3(
  mensaje = "Solo un administrador global (N3) puede administrar usuarios",
): Promise<{ usuario: UsuarioSesion; error: null } | { usuario: null; error: NextResponse }> {
  const { usuario, error } = await requerirUsuario();
  if (error) return { usuario: null, error };
  if (usuario.nivel !== "N3") {
    return {
      usuario: null,
      error: NextResponse.json({ error: mensaje }, { status: 403 }),
    };
  }
  return { usuario, error: null };
}

export function formatearFolio(tipo: string, anio: number, consecutivo: number): string {
  return `${tipo}-${anio}-${String(consecutivo).padStart(4, "0")}`;
}

export const TIPOS_DOCUMENTO = [
  "F-01", "F-02", "F-03", "F-04", "F-05", "F-06",
  "F-07", "F-08", "F-09", "F-10", "F-11",
  "C-01", "C-02", "C-03", "C-04",
] as const;

export const ESTADOS_UNIDAD = [
  "EN_RECEPCION", "EN_INSPECCION", "EXPEDIENTE_INCOMPLETO", "LISTO_PARA_VENTA",
  "APARTADA", "VENDIDA_PEND_ENTREGA", "ENTREGADA", "DEVUELTA_CONSIGNANTE", "BAJA",
] as const;

export const ESTADOS_EXPEDIENTE = ["INCOMPLETO", "COMPLETO", "LISTO_PARA_VENTA"] as const;

/** Parsea un id numérico de segmento de ruta; null si no es válido. */
export function parseId(valor: string): number | null {
  const n = Number(valor);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** El cierre conserva la consulta para todos, pero la modificación posterior
 * queda reservada a N3. Las rutas de escritura llaman a este candado antes de
 * crear, capturar, adjuntar, cancelar o cambiar estados. */
export async function requerirExpedienteEditable(
  expedienteId: number,
  usuario: UsuarioSesion,
): Promise<NextResponse | null> {
  const cierre = await query<{ cerrado: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM traza.expediente_cierre WHERE expediente_id = $1
     ) AS cerrado`,
    [expedienteId],
  );
  if (cierre.rows[0]?.cerrado && usuario.nivel !== "N3") {
    return NextResponse.json(
      { error: "El expediente está cerrado. Solo un administrador N3 puede modificarlo." },
      { status: 409 },
    );
  }
  return null;
}

export async function requerirDocumentoEditable(
  documentoId: number,
  usuario: UsuarioSesion,
): Promise<NextResponse | null> {
  const documento = await query<{ expediente_id: number }>(
    `SELECT expediente_id FROM traza.documento WHERE id = $1`,
    [documentoId],
  );
  if ((documento.rowCount ?? 0) === 0) return respuesta404("Documento no encontrado");
  return requerirExpedienteEditable(documento.rows[0].expediente_id, usuario);
}

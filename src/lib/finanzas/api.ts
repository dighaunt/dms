import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { requerirUsuario, respuesta400, respuestaError } from "@/lib/api";
import type { UsuarioSesion } from "@/lib/auth/usuario";

/**
 * Puente entre la capa de servicios de Finanzas y las respuestas HTTP.
 *
 * Los servicios ya validan su entrada con zod y dejan propagar los errores de
 * negocio de Postgres. Las rutas no repiten esos esquemas —duplicarlos sería
 * garantizar que un día divergen— sino que pasan el cuerpo tal cual y traducen
 * aquí lo que salga:
 *
 *   ZodError            -> 400 con el detalle de qué campo falla
 *   P0001 (RAISE)       -> 409 con el mensaje del manual, vía respuestaError
 *   resto de códigos pg -> lo que respuestaError ya decide
 */
export async function responder<T>(
  accion: () => Promise<T>,
  alExito: (dato: T) => NextResponse = (dato) => NextResponse.json(dato),
): Promise<NextResponse> {
  try {
    return alExito(await accion());
  } catch (error) {
    if (error instanceof z.ZodError) return respuesta400(error);
    return respuestaError(error);
  }
}

/** 201 para las creaciones, que es lo que devuelve emitir un folio. */
export const creado = <T>(dato: T): NextResponse => NextResponse.json(dato, { status: 201 });

/** Lee el cuerpo sin imponerle forma: el servicio es quien la valida. */
export async function cuerpo(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

/**
 * Los tres niveles del sistema, ordenados: N1 opera, N2 supervisa, N3
 * administra. `requerirN3` de "@/lib/api" resuelve el extremo de arriba, pero
 * Finanzas tiene actos que no son administración del sistema y tampoco puede
 * hacer cualquiera —dar por atendida la alerta de un faltante, por ejemplo, es
 * un acto de supervisión sobre quien tenía el dinero a su cargo—, así que hace
 * falta poder pedir "de N2 para arriba" sin cerrarlo a N3.
 */
const ORDEN_NIVEL: Record<UsuarioSesion["nivel"], number> = { N1: 1, N2: 2, N3: 3 };

/**
 * Exige sesión con un nivel mínimo. El mensaje se pide explícito porque un 403
 * que no dice QUIÉN puede hacer la operación obliga a adivinarlo.
 */
export async function requerirNivelMinimo(
  minimo: UsuarioSesion["nivel"],
  mensaje: string,
): Promise<{ usuario: UsuarioSesion; error: null } | { usuario: null; error: NextResponse }> {
  const { usuario, error } = await requerirUsuario();
  if (error) return { usuario: null, error };
  if (ORDEN_NIVEL[usuario.nivel] < ORDEN_NIVEL[minimo]) {
    return { usuario: null, error: NextResponse.json({ error: mensaje }, { status: 403 }) };
  }
  return { usuario, error: null };
}

/** Convierte un parámetro de consulta a número, o undefined si no viene. */
export function numeroDeConsulta(url: URL, clave: string): number | undefined {
  const valor = url.searchParams.get(clave);
  if (valor === null || valor.trim() === "") return undefined;
  const n = Number(valor);
  return Number.isFinite(n) ? n : undefined;
}

/** Convierte un parámetro de consulta a texto, o undefined si viene vacío. */
export function textoDeConsulta(url: URL, clave: string): string | undefined {
  const valor = url.searchParams.get(clave);
  return valor === null || valor.trim() === "" ? undefined : valor.trim();
}

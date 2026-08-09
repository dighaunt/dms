import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { requerirUsuario, respuesta400, respuestaError } from "@/lib/api";
import type { UsuarioSesion } from "@/lib/auth/usuario";

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

export const creado = <T>(dato: T): NextResponse => NextResponse.json(dato, { status: 201 });

export async function cuerpo(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

const ORDEN_NIVEL: Record<UsuarioSesion["nivel"], number> = { N1: 1, N2: 2, N3: 3 };

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

export function numeroDeConsulta(url: URL, clave: string): number | undefined {
  const valor = url.searchParams.get(clave);
  if (valor === null || valor.trim() === "") return undefined;
  const n = Number(valor);
  return Number.isFinite(n) ? n : undefined;
}

export function textoDeConsulta(url: URL, clave: string): string | undefined {
  const valor = url.searchParams.get(clave);
  return valor === null || valor.trim() === "" ? undefined : valor.trim();
}

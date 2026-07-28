import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { respuesta400, respuestaError } from "@/lib/api";

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

import "server-only";

import { cookies, headers } from "next/headers";

import { env } from "@/lib/env";
import { jwtVigente } from "@/lib/jwt";

function esRechazoDeToken(status: number, body: string): boolean {
  return (
    status === 401 ||
    /jwt token has expired|token.*expired|invalid jwt|jwt.*invalid/i.test(body)
  );
}

async function obtenerJwtActual(): Promise<string | null> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .filter((cookie) => cookie.name.includes("neon-auth"))
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
  if (!cookieHeader) return null;

  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin") ??
    requestHeaders.get("referer")?.split("/").slice(0, 3).join("/") ??
    "";
  const tokenUrl = new URL(
    "token",
    env.NEON_AUTH_BASE_URL.endsWith("/")
      ? env.NEON_AUTH_BASE_URL
      : `${env.NEON_AUTH_BASE_URL}/`,
  );
  const response = await fetch(tokenUrl, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      Cookie: cookieHeader,
      Origin: origin,
      "x-neon-auth-proxy": "nextjs",
    },
  });
  const body = await response.text();
  if (!response.ok) {
    if (esRechazoDeToken(response.status, body)) return null;
    throw new Error(`Neon Auth ${response.status} al emitir JWT para Data API: ${body}`);
  }
  try {
    const parsed = JSON.parse(body) as { token?: unknown };
    return typeof parsed.token === "string" ? parsed.token : null;
  } catch {
    throw new Error("Neon Auth devolvió una respuesta de token inválida");
  }
}

/**
 * Cliente del Neon Data API (PostgREST) para LECTURAS, autenticado con el JWT
 * de la sesión de Neon Auth (rol `authenticated`). Las escrituras nunca pasan
 * por aquí: van a las funciones transaccionales de traza vía pg.
 * Devuelve null si el Data API no está configurado o no hay JWT de sesión,
 * para que el llamador haga la misma lectura por SQL directo.
 */
export async function dataApiGet<Fila>(recurso: string): Promise<Fila[] | null> {
  if (!env.DATA_API_URL) return null;

  // La llamada es no-store porque el endpoint es GET y cada respuesta contiene
  // un JWT de vida corta. Cachearlo fue la causa del token vencido observado.
  const jwt = await obtenerJwtActual();
  if (!jwt || !jwtVigente(jwt)) return null;

  const res = await fetch(`${env.DATA_API_URL}/${recurso}`, {
    headers: { Authorization: `Bearer ${jwt}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    if (esRechazoDeToken(res.status, body)) return null;
    throw new Error(`Data API ${res.status} en ${recurso}: ${body}`);
  }
  return (await res.json()) as Fila[];
}

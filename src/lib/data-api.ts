import "server-only";

import { auth } from "@/lib/auth";
import { env } from "@/lib/env";

/**
 * Cliente del Neon Data API (PostgREST) para LECTURAS, autenticado con el JWT
 * de la sesión de Neon Auth (rol `authenticated`). Las escrituras nunca pasan
 * por aquí: van a las funciones transaccionales de traza vía pg.
 * Devuelve null si el Data API no está configurado o no hay JWT de sesión,
 * para que el llamador haga la misma lectura por SQL directo.
 */
export async function dataApiGet<Fila>(recurso: string): Promise<Fila[] | null> {
  if (!env.DATA_API_URL) return null;

  const { data } = await auth.token();
  const jwt = data?.token;
  if (!jwt) return null;

  const res = await fetch(`${env.DATA_API_URL}/${recurso}`, {
    headers: { Authorization: `Bearer ${jwt}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Data API ${res.status} en ${recurso}: ${await res.text()}`);
  }
  return (await res.json()) as Fila[];
}

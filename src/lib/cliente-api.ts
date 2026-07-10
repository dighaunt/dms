"use client";

import { toast } from "sonner";

/**
 * Envía JSON y maneja errores de forma uniforme: los 409 traen el mensaje
 * literal del candado del manual y se muestran tal cual en un toast.
 */
async function enviarJson<Respuesta>(
  method: "POST" | "PATCH",
  url: string,
  body: unknown,
): Promise<Respuesta | null> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const cuerpo = await res.json().catch(() => ({}));
  if (!res.ok) {
    toast.error(cuerpo.error ?? `Error ${res.status}`, {
      description: typeof cuerpo.detalle === "string" ? cuerpo.detalle : undefined,
    });
    return null;
  }
  return cuerpo as Respuesta;
}

export const postJson = <Respuesta = unknown>(url: string, body: unknown) =>
  enviarJson<Respuesta>("POST", url, body);

export const patchJson = <Respuesta = unknown>(url: string, body: unknown) =>
  enviarJson<Respuesta>("PATCH", url, body);

export type RespuestaDetallada<Respuesta> =
  | { ok: true; data: Respuesta }
  | { ok: false; status: number; error: string };

/**
 * Como postJson pero sin toast automático: el caller decide qué hacer con el
 * error (p. ej. los 409 de candados se explican en el propio elemento).
 */
export async function postJsonDetallado<Respuesta = unknown>(
  url: string,
  body: unknown,
): Promise<RespuestaDetallada<Respuesta>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const cuerpo = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: cuerpo.error ?? `Error ${res.status}`,
    };
  }
  return { ok: true, data: cuerpo as Respuesta };
}

export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

"use client";

import { toast } from "sonner";

/**
 * POST JSON y manejo uniforme de errores: los 409 traen el mensaje literal
 * del candado del manual y se muestran tal cual en un toast destructivo.
 */
export async function postJson<Respuesta = unknown>(
  url: string,
  body: unknown,
): Promise<Respuesta | null> {
  const res = await fetch(url, {
    method: "POST",
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

export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

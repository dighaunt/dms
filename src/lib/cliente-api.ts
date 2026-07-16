"use client";

import { toast } from "sonner";

type CuerpoError = {
  error?: unknown;
  message?: unknown;
};

const MENSAJES_POR_ESTADO: Record<number, string> = {
  400: "Revisa los datos capturados e inténtalo de nuevo.",
  401: "Tu sesión terminó o no está activa. Inicia sesión de nuevo.",
  402: "No se pudo completar la operación porque el servicio externo requiere atención del administrador.",
  403: "No tienes permiso para realizar esta operación.",
  404: "No se encontró la información solicitada. Actualiza la página e inténtalo de nuevo.",
  405: "Esta operación no está disponible en este momento.",
  408: "La operación tardó demasiado. Verifica tu conexión e inténtalo de nuevo.",
  409: "La operación no se puede completar por el estado actual del expediente.",
  413: "El archivo o la información enviada supera el tamaño permitido.",
  415: "El formato de la información enviada no es válido.",
  422: "Faltan datos obligatorios o alguno requiere corrección.",
  429: "Se alcanzó el límite de intentos. Espera un momento antes de volver a intentarlo.",
};

function textoDeError(cuerpo: unknown): string | null {
  if (!cuerpo || typeof cuerpo !== "object") return null;
  const valor = (cuerpo as CuerpoError).error;
  if (typeof valor !== "string") return null;
  const mensaje = valor.trim();
  if (!mensaje || mensaje.length > 500) return null;

  // Un error de proveedor, HTTP o base de datos no es una instrucción útil
  // para operación y nunca debe aparecer como texto crudo en un toast.
  if (
    /\b(?:error|failed|invalid|unexpected|internal server|bad gateway|service unavailable|network|fetch|timeout|cannot|postgres(?:ql)?|sqlstate|constraint|duplicate key|syntax|stack|trace|neon|vercel|blob|json|html|http)\b/i.test(
      mensaje,
    )
  ) {
    return null;
  }
  // Las rutas propias redactan sus reglas en español. Si una dependencia
  // devuelve texto ajeno, se usa el mensaje contextual del código HTTP en vez
  // de arriesgarse a mostrar un error en inglés.
  if (
    !/(?:[áéíóúñ]|\b(?:el|la|los|las|un|una|no|para|porque|de|del|en|con|se|debe|puede|requiere|expediente|documento|datos|correo|contraseña|sesión|usuario|archivo|operación)\b)/i.test(
      mensaje,
    )
  ) {
    return null;
  }
  return mensaje;
}

/**
 * Convierte una respuesta fallida en un mensaje breve, seguro y apto para
 * operadores. Conserva las reglas de negocio redactadas por la aplicación,
 * pero reemplaza mensajes técnicos, proveedores y códigos HTTP por contexto.
 */
export function mensajeErrorRespuesta(status: number, cuerpo?: unknown): string {
  const mensaje = textoDeError(cuerpo);
  if (mensaje) return mensaje;
  if (status >= 500) {
    return "El servidor tuvo un problema temporal. Intenta de nuevo y, si continúa, avisa al administrador.";
  }
  return MENSAJES_POR_ESTADO[status] ?? "No se pudo completar la operación. Intenta de nuevo.";
}

/** Error de red o de una dependencia que no entregó una respuesta HTTP. */
export function mensajeErrorSinRespuesta(): string {
  return "No se pudo conectar con el servicio. Verifica tu conexión e inténtalo de nuevo.";
}

/**
 * Envía JSON y maneja errores de forma uniforme: los 409 traen el mensaje
 * literal del candado del manual y se muestran tal cual en un toast.
 */
async function enviarJson<Respuesta>(
  method: "POST" | "PATCH",
  url: string,
  body: unknown,
): Promise<Respuesta | null> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const cuerpo: unknown = await res.json().catch(() => undefined);
    if (!res.ok) {
      toast.error(mensajeErrorRespuesta(res.status, cuerpo));
      return null;
    }
    return cuerpo as Respuesta;
  } catch {
    toast.error(mensajeErrorSinRespuesta());
    return null;
  }
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
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const cuerpo: unknown = await res.json().catch(() => undefined);
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: mensajeErrorRespuesta(res.status, cuerpo),
      };
    }
    return { ok: true, data: cuerpo as Respuesta };
  } catch {
    return {
      ok: false,
      status: 0,
      error: mensajeErrorSinRespuesta(),
    };
  }
}

export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

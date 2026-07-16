"use client";

import { mensajeErrorRespuesta, mensajeErrorSinRespuesta } from "@/lib/cliente-api";

// Cliente de auth mínimo: fetch directo al proxy /api/auth (mismo origen).
// El SDK de @neondatabase/auth en el navegador se colgaba al iniciar sesión,
// así que hablamos con los endpoints de better-auth directamente; las cookies
// de sesión las firma el handler del servidor.

type ResultadoAuth = { ok: true } | { ok: false; error: string };

export async function iniciarSesion(
  email: string,
  password: string,
  // true → cookie persistente (la sesión de better-auth dura 7 días);
  // false → cookie de sesión: se cierra al cerrar el navegador.
  recordar = true,
): Promise<ResultadoAuth> {
  try {
    const res = await fetch("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, rememberMe: recordar }),
    });
    if (!res.ok) {
      const cuerpo: unknown = await res.json().catch(() => undefined);
      return {
        ok: false,
        error:
          res.status === 400 || res.status === 401 || res.status === 403
            ? "Correo o contraseña incorrectos. Verifica tus datos."
            : mensajeErrorRespuesta(res.status, cuerpo),
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: mensajeErrorSinRespuesta() };
  }
}

export async function cerrarSesion(): Promise<void> {
  // better-auth responde 415 si el POST no lleva JSON: el body vacío es
  // obligatorio o las cookies de sesión nunca se borran.
  await fetch("/api/auth/sign-out", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
}

export async function cambiarContrasena(
  actual: string,
  nueva: string,
): Promise<ResultadoAuth> {
  try {
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: actual,
        newPassword: nueva,
        revokeOtherSessions: true,
      }),
    });
    if (!res.ok) {
      const cuerpo = await res.json().catch(() => ({})) as { code?: string };
      // better-auth responde en inglés; se traducen los códigos conocidos.
      const traduccion: Record<string, string> = {
        INVALID_PASSWORD: "La contraseña actual es incorrecta.",
        PASSWORD_TOO_SHORT: "La nueva contraseña es demasiado corta (mínimo 8 caracteres).",
        PASSWORD_TOO_LONG: "La nueva contraseña es demasiado larga.",
      };
      return {
        ok: false,
        error: traduccion[cuerpo.code ?? ""] ?? mensajeErrorRespuesta(res.status, cuerpo),
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: mensajeErrorSinRespuesta() };
  }
}

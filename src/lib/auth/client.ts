"use client";

// Cliente de auth mínimo: fetch directo al proxy /api/auth (mismo origen).
// El SDK de @neondatabase/auth en el navegador se colgaba al iniciar sesión,
// así que hablamos con los endpoints de better-auth directamente; las cookies
// de sesión las firma el handler del servidor.

type ResultadoAuth = { ok: true } | { ok: false; error: string };

export async function iniciarSesion(
  email: string,
  password: string,
): Promise<ResultadoAuth> {
  const res = await fetch("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const cuerpo = await res.json().catch(() => ({}));
    return {
      ok: false,
      error:
        cuerpo.message ?? cuerpo.error ?? "Correo o contraseña incorrectos",
    };
  }
  return { ok: true };
}

export async function cerrarSesion(): Promise<void> {
  await fetch("/api/auth/sign-out", { method: "POST" });
}

import { NextResponse } from "next/server";
import { z } from "zod";

import { leerBody, requerirN3, respuestaError } from "@/lib/api";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";

const bodySchema = z.object({
  email: z.email().transform((v) => v.toLowerCase()),
  nombre: z.string().trim().min(1),
  password: z.string().min(8, "Mínimo 8 caracteres"),
  nivel: z.enum(["N1", "N2", "N3"]),
});

function mensajeAltaUsuario(error: unknown): string {
  const codigo =
    error && typeof error === "object" && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;
  if (typeof codigo === "string" && /(?:already|duplicate|exists)/i.test(codigo)) {
    return "Ya existe una cuenta con ese correo electrónico.";
  }
  return "No se pudo crear la cuenta. Revisa los datos e inténtalo de nuevo.";
}

// Alta de usuario por el administrador: crea la cuenta en Neon Auth (vía la
// admin API del auth server, autenticada con la sesión N3) y registra el
// nivel en traza.usuario. El registro público sigue deshabilitado.
export async function POST(request: Request) {
  const { error: authError } = await requerirN3();
  if (authError) return authError;

  const { data, error: bodyError } = await leerBody(request, bodySchema);
  if (bodyError) return bodyError;

  try {
    const creado = await auth.admin.createUser({
      email: data.email,
      password: data.password,
      name: data.nombre,
    });
    if (creado.error) {
      return NextResponse.json(
        { error: mensajeAltaUsuario(creado.error) },
        { status: 409 },
      );
    }

    const { rows } = await query<{ id: number }>(
      `INSERT INTO traza.usuario (email, nombre, nivel)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET nombre = EXCLUDED.nombre, nivel = EXCLUDED.nivel
       RETURNING id::int AS id`,
      [data.email, data.nombre, data.nivel],
    );

    return NextResponse.json(
      { id: rows[0].id, email: data.email, nombre: data.nombre, nivel: data.nivel },
      { status: 201 },
    );
  } catch (error) {
    return respuestaError(error);
  }
}

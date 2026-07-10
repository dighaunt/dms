import { NextResponse } from "next/server";
import { z } from "zod";

import {
  leerBody,
  parseId,
  requerirN3,
  respuesta404,
  respuestaError,
} from "@/lib/api";
import { query } from "@/lib/db";

const bodySchema = z
  .object({
    nivel: z.enum(["N1", "N2", "N3"]).optional(),
    activo: z.boolean().optional(),
  })
  .refine((v) => v.nivel !== undefined || v.activo !== undefined, {
    message: "Nada que actualizar",
  });

// Cambia nivel y/o activo de un usuario. Un N3 no puede modificarse a sí
// mismo (evita quedarse fuera bajándose de nivel o desactivándose).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { usuario, error: authError } = await requerirN3();
  if (authError) return authError;

  const id = parseId((await params).id);
  if (id === null) return respuesta404("Usuario no encontrado");

  const { data, error: bodyError } = await leerBody(request, bodySchema);
  if (bodyError) return bodyError;

  if (id === usuario.id) {
    return NextResponse.json(
      { error: "No puedes cambiar tu propio nivel ni desactivarte" },
      { status: 409 },
    );
  }

  try {
    const { rows } = await query<{
      id: number;
      email: string;
      nivel: string;
      activo: boolean;
    }>(
      `UPDATE traza.usuario
          SET nivel = COALESCE($2, nivel),
              activo = COALESCE($3, activo)
        WHERE id = $1
        RETURNING id::int AS id, email, nivel, activo`,
      [id, data.nivel ?? null, data.activo ?? null],
    );
    if (rows.length === 0) return respuesta404("Usuario no encontrado");
    return NextResponse.json(rows[0]);
  } catch (error) {
    return respuestaError(error);
  }
}

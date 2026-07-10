import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";

const handlers = auth.handler();

// Registro público deshabilitado: las cuentas las crea el administrador en la
// consola de Neon Auth (o vía admin API). Se bloquea aquí, no solo en la UI.
function bloquearRegistro(path: string[]): NextResponse | null {
  if (path[0] === "sign-up") {
    return NextResponse.json(
      { error: "El registro está deshabilitado; solicita tu cuenta al administrador" },
      { status: 403 },
    );
  }
  return null;
}

export const { GET, PUT, DELETE, PATCH } = handlers;

export async function POST(
  request: Request,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const bloqueo = bloquearRegistro((await ctx.params).path);
  if (bloqueo) return bloqueo;
  return handlers.POST(request, ctx);
}

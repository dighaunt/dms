import { NextResponse } from "next/server";

import { requerirUsuario, respuesta404 } from "@/lib/api";
import { responder } from "@/lib/finanzas/api";
import { verificarToken } from "@/lib/finanzas/sellos";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { error } = await requerirUsuario();
  if (error) return error;

  const { token } = await params;
  return responder(
    () => verificarToken(token),
    (sello) => (sello ? NextResponse.json(sello) : respuesta404("Ese sello no existe")),
  );
}

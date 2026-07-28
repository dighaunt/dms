import { NextResponse } from "next/server";

import { requerirUsuario, respuesta404 } from "@/lib/api";
import { responder } from "@/lib/finanzas/api";
import { verificarToken } from "@/lib/finanzas/sellos";

/**
 * Verificación de un sello por su token.
 *
 * Lo que devuelve es deliberadamente escueto: acredita el hecho —qué folio,
 * qué acción, quién y cuándo— sin exponer importes ni datos personales a quien
 * sólo tecleó un código. El dígito verificador se comprueba antes de consultar,
 * así que un token mal transcrito ni siquiera llega a la base.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { error } = await requerirUsuario();
  if (error) return error;

  const { token } = await params;
  return responder(
    () => verificarToken(token),
    (sello) => (sello ? NextResponse.json(sello) : respuesta404("Ese sello no existe")),
  );
}

import { NextResponse } from "next/server";

import { parseId, requerirUsuario, respuesta404 } from "@/lib/api";
import { cuerpo, responder } from "@/lib/finanzas/api";
import { type EntradaCerrarCorte, cerrarCorte, obtenerCorte } from "@/lib/finanzas/corte";

/**
 * Cierra el día. El único importe que entra por aquí es el efectivo físico
 * contado: todo lo demás lo calcula la base a partir de los folios firmados.
 *
 * Si el arqueo no coincide con el saldo calculado, la función SQL exige una
 * explicación y, cuando hay faltante, levanta alerta para el Gerente General.
 * Ninguna de esas dos cosas se decide aquí.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { usuario, error } = await requerirUsuario();
  if (error) return error;

  const id = parseId((await params).id);
  if (id === null) return respuesta404("Corte no encontrado");

  const datos = (await cuerpo(request)) as Record<string, unknown>;
  return responder(async () => {
    await cerrarCorte(id, datos as EntradaCerrarCorte, usuario.id);
    return { corte: await obtenerCorte(id) };
  }, (dato) => NextResponse.json(dato));
}

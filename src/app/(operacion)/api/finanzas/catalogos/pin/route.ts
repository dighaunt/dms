import { NextResponse } from "next/server";

import { requerirUsuario } from "@/lib/api";
import { cuerpo, responder } from "@/lib/finanzas/api";
import { establecerPin, tienePinDeFirma } from "@/lib/finanzas/catalogos";

export async function GET() {
  const { usuario, error } = await requerirUsuario();
  if (error) return error;

  return responder(async () => ({ tienePin: await tienePinDeFirma(usuario.id) }));
}

export async function POST(request: Request) {
  const { usuario, error } = await requerirUsuario();
  if (error) return error;

  const datos = (await cuerpo(request)) as Record<string, unknown>;
  const pin = datos.pin;

  

  if (typeof pin !== "string") {
    return NextResponse.json({ error: "Captura tu PIN de firma." }, { status: 400 });
  }

  return responder(async () => {
    await establecerPin(usuario.id, pin);

    return { establecido: true };
  });
}

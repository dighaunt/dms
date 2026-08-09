import { NextResponse } from "next/server";

import { parseId, respuesta404 } from "@/lib/api";
import { cuerpo, requerirNivelMinimo, responder } from "@/lib/finanzas/api";
import { type EntradaDarDeBajaSocio, darDeBajaSocio } from "@/lib/finanzas/personas";

const MENSAJE_N3 =
  "Solo un administrador global (N3) puede dar de baja a un socio: la salida de un accionista se acredita con el documento que la asienta";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requerirNivelMinimo("N3", MENSAJE_N3);
  if (error) return error;

  const personaId = parseId((await params).id);
  if (personaId === null) return respuesta404("Esa persona no está registrada como socio");

  const datos = (await cuerpo(request)) as EntradaDarDeBajaSocio;

  return responder(
    () => darDeBajaSocio(personaId, datos),
    (socio) =>
      socio
        ? NextResponse.json(socio)
        : respuesta404("Esa persona no está registrada como socio"),
  );
}

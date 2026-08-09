import { NextResponse } from "next/server";

import { parseId, requerirUsuario, respuesta404 } from "@/lib/api";
import { cuerpo, requerirNivelMinimo, responder } from "@/lib/finanzas/api";
import {
  type EntradaActualizarPersona,
  activarPersona,
  actualizarPersona,
  desactivarPersona,
  obtenerPersona,
} from "@/lib/finanzas/personas";

const MENSAJE_N3 =
  "Solo un administrador global (N3) puede corregir o dar de baja una persona del catálogo";

const NO_EXISTE = "La persona no existe en el catálogo";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requerirUsuario();
  if (error) return error;

  const id = parseId((await params).id);
  if (id === null) return respuesta404(NO_EXISTE);

  return responder(
    () => obtenerPersona(id),
    (persona) => (persona ? NextResponse.json(persona) : respuesta404(NO_EXISTE)),
  );
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requerirNivelMinimo("N3", MENSAJE_N3);
  if (error) return error;

  const id = parseId((await params).id);
  if (id === null) return respuesta404(NO_EXISTE);

  const datos = (await cuerpo(request)) as Record<string, unknown>;

  if (typeof datos.activa === "boolean" && datos.nombre === undefined) {
    const activa = datos.activa;
    return responder(
      () => (activa ? activarPersona(id) : desactivarPersona(id)),
      (persona) => (persona ? NextResponse.json(persona) : respuesta404(NO_EXISTE)),
    );
  }

  return responder(
    () => actualizarPersona(id, datos as EntradaActualizarPersona),
    (persona) => (persona ? NextResponse.json(persona) : respuesta404(NO_EXISTE)),
  );
}

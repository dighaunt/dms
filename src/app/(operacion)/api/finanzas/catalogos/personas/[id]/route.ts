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

/** La ficha completa de una persona. Cualquier sesión puede consultarla. */
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

/**
 * Corrige la ficha, o la da de baja y la reactiva.
 *
 * Se distinguen por el cuerpo: uno que trae `activa` y no trae `nombre` es la
 * baja o la reactivación; cualquier otro es el formulario completo. El
 * formulario se recibe completo a propósito —un parche que interpretara la
 * ausencia de un campo como "déjalo igual" haría imposible borrar el teléfono
 * mal capturado de un proveedor—, y por eso `activa` no se toma de él: darla de
 * baja es un acto propio, no un renglón más de la forma.
 *
 * Corregir el nombre aquí NO reescribe ningún vale ya emitido: el documento
 * guarda el nombre y la identificación como texto, que es la foto de lo que
 * alguien firmó. Para eso el vale conserva las dos cosas, el texto y el enlace.
 */
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

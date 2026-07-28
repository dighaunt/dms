import { NextResponse } from "next/server";

import { parseId, requerirUsuario, respuesta404 } from "@/lib/api";
import { responder } from "@/lib/finanzas/api";
import { firmasDe, firmasPendientes, obtenerDocumento } from "@/lib/finanzas/documentos";
import { sellosDe } from "@/lib/finanzas/sellos";

/**
 * Ficha completa del folio: cabecera, firmas puestas, firmas que faltan y los
 * sellos ya acuñados. Va en una sola respuesta porque la pantalla del
 * documento necesita las cuatro cosas a la vez para decidir qué ofrecer.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requerirUsuario();
  if (error) return error;

  const id = parseId((await params).id);
  if (id === null) return respuesta404("Folio no encontrado");

  return responder(async () => {
    const documento = await obtenerDocumento(id);
    if (!documento) return null;
    const [firmas, pendientes, sellos] = await Promise.all([
      firmasDe(id),
      firmasPendientes(id),
      sellosDe(id),
    ]);
    return { documento, firmas, pendientes, sellos };
  }, (dato) => (dato ? NextResponse.json(dato) : respuesta404("Folio no encontrado")));
}

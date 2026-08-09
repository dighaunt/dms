import { NextResponse } from "next/server";

import { parseId, requerirUsuario, respuesta404 } from "@/lib/api";
import { cuerpo, responder } from "@/lib/finanzas/api";
import { armarCorte, detalleCorte, obtenerCorte, ubicacionEfectivo } from "@/lib/finanzas/corte";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requerirUsuario();
  if (error) return error;

  const id = parseId((await params).id);
  if (id === null) return respuesta404("Corte no encontrado");

  return responder(
    async () => {
      const corte = await obtenerCorte(id);
      if (!corte) return null;
      return {
        corte,
        detalle: await detalleCorte(id),
        ubicacion: await ubicacionEfectivo(id),
      };
    },
    (dato) => (dato ? NextResponse.json(dato) : respuesta404("Corte no encontrado")),
  );
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { usuario, error } = await requerirUsuario();
  if (error) return error;

  const id = parseId((await params).id);
  if (id === null) return respuesta404("Corte no encontrado");

  await cuerpo(request);
  return responder(async () => {
    await armarCorte(id, usuario.id);
    return { corte: await obtenerCorte(id), detalle: await detalleCorte(id) };
  });
}

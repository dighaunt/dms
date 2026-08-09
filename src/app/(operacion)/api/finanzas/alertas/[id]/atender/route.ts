import { NextResponse } from "next/server";

import { parseId, respuesta404 } from "@/lib/api";
import { cuerpo, requerirNivelMinimo, responder } from "@/lib/finanzas/api";
import { atenderAlerta } from "@/lib/finanzas/egresos";

const MENSAJE_AUTORIZACION =
  "Atender una alerta de Finanzas es un acto de supervisión sobre quien tenía el dinero a su cargo: requiere nivel N2 o N3";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { usuario, error } = await requerirNivelMinimo("N2", MENSAJE_AUTORIZACION);
  if (error) return error;

  const id = parseId((await params).id);
  if (id === null) return respuesta404("Alerta no encontrada");

  
  const { nota } = (await cuerpo(request)) as { nota: string };

  return responder(
    () => atenderAlerta(id, usuario.id, nota),
    (resultado) =>
      resultado === null
        ? respuesta404("Alerta no encontrada")
        : NextResponse.json(resultado),
  );
}

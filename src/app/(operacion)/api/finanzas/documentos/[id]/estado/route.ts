import { NextResponse } from "next/server";

import { parseId, requerirUsuario, respuesta404 } from "@/lib/api";
import { cuerpo, responder } from "@/lib/finanzas/api";
import { cancelarFolio, enviarAFirma, regresarABorrador } from "@/lib/finanzas/documentos";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { usuario, error } = await requerirUsuario();
  if (error) return error;

  const id = parseId((await params).id);
  if (id === null) return respuesta404("Folio no encontrado");

  const datos = (await cuerpo(request)) as { accion?: string; motivo?: string };

  switch (datos.accion) {
    case "enviar-a-firma":
      return responder(() => enviarAFirma(id, usuario.id), () =>
        NextResponse.json({ estado: "PENDIENTE_DE_FIRMA" }),
      );
    case "regresar-a-borrador":
      return responder(() => regresarABorrador(id, usuario.id), () =>
        NextResponse.json({ estado: "BORRADOR" }),
      );
    case "cancelar":
      return responder(() => cancelarFolio(id, usuario.id, datos.motivo ?? ""), () =>
        NextResponse.json({ estado: "CANCELADO" }),
      );
    default:
      return NextResponse.json(
        { error: "Indica qué hacer con el folio: enviar-a-firma, regresar-a-borrador o cancelar." },
        { status: 400 },
      );
  }
}

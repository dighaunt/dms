import { NextResponse } from "next/server";

import { parseId, requerirUsuario, respuesta404, respuestaError } from "@/lib/api";
import { confirmarGuiaDocumento } from "@/lib/formularios/captura";

// La identidad nunca llega del cliente: la sesión firma esta constancia.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { usuario, error: authError } = await requerirUsuario();
  if (authError) return authError;
  const id = parseId((await params).id);
  if (id === null) return respuesta404("Documento no encontrado");

  try {
    const confirmado = await confirmarGuiaDocumento(id, usuario.id);
    if (!confirmado) return respuesta404("Documento no encontrado");
    return NextResponse.json({ documentoId: id, guiaConfirmada: true }, { status: 201 });
  } catch (error) {
    return respuestaError(error);
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";

import {
  leerBody,
  parseId,
  requerirUsuario,
  respuesta404,
  respuestaError,
} from "@/lib/api";
import { guardarCapturaDocumento, obtenerCapturaDocumento } from "@/lib/formularios/captura";

const bodySchema = z.object({
  action: z.enum(["save", "complete"]),
  values: z.record(z.string(), z.string()),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { usuario, error: authError } = await requerirUsuario();
  if (authError) return authError;
  const id = parseId((await params).id);
  if (id === null) return respuesta404("Documento no encontrado");

  try {
    const captura = await obtenerCapturaDocumento(id, usuario.id);
    if (!captura) return respuesta404("Documento no encontrado");
    return NextResponse.json(captura);
  } catch (error) {
    return respuestaError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { usuario, error: authError } = await requerirUsuario();
  if (authError) return authError;
  const id = parseId((await params).id);
  if (id === null) return respuesta404("Documento no encontrado");
  const { data, error: bodyError } = await leerBody(request, bodySchema);
  if (bodyError) return bodyError;

  try {
    const result = await guardarCapturaDocumento(
      id,
      usuario.id,
      data.values,
      data.action === "complete",
    );
    if (!result) return respuesta404("Documento no encontrado");
    if (!result.ok) {
      return NextResponse.json(
        {
          error: `Hay ${result.missing.length} datos que requieren atención`,
          missing: result.missing,
        },
        { status: 422 },
      );
    }
    return NextResponse.json(result.captura);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/inválid|excede|wizard|validación|guía|confirma/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (/escaneado|inmutable|captura quedó cerrada/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    return respuestaError(error);
  }
}

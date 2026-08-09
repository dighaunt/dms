import { NextResponse } from "next/server";

import { parseId, requerirUsuario, respuesta404 } from "@/lib/api";
import { cuerpo, responder } from "@/lib/finanzas/api";
import { hashDelDocumento } from "@/lib/finanzas/contenido";
import {
  type EntradaFirmaInterna,
  type EntradaFirmaTercero,
  firmarComoInterno,
  firmarComoTercero,
} from "@/lib/finanzas/documentos";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { usuario, error } = await requerirUsuario();
  if (error) return error;

  const id = parseId((await params).id);
  if (id === null) return respuesta404("Folio no encontrado");

  const datos = (await cuerpo(request)) as Record<string, unknown>;
  const origenSesion = request.headers.get("user-agent")?.slice(0, 200) ?? null;

  let hashContenido: string;
  try {
    hashContenido = await hashDelDocumento(id);
  } catch {
    return respuesta404("Folio no encontrado");
  }

  if (datos.metodo === "AUTOGRAFA_PRESENCIAL") {
    const entrada = {
      ...datos,
      documentoId: id,
      atestiguaUsuario: usuario.id,
      hashContenido,
      origenSesion,
    } as EntradaFirmaTercero;

    return responder(
      () => firmarComoTercero(entrada),
      (estado) => NextResponse.json({ estado }),
    );
  }

  const entrada = {
    ...datos,
    documentoId: id,
    usuario: usuario.id,
    hashContenido,
    origenSesion,
  } as EntradaFirmaInterna;

  return responder(
    () => firmarComoInterno(entrada),
    (estado) => NextResponse.json({ estado }),
  );
}

import { NextResponse } from "next/server";

import { parseId, requerirUsuario, respuesta404 } from "@/lib/api";
import { cuerpo, responder } from "@/lib/finanzas/api";
import {
  type EntradaFirmaInterna,
  type EntradaFirmaTercero,
  firmarComoInterno,
  firmarComoTercero,
} from "@/lib/finanzas/documentos";

/**
 * Rúbrica de un rol del documento.
 *
 * Dos reglas quedan impuestas aquí y no son negociables desde el cuerpo de la
 * petición:
 *
 *  · Quien firma como interno es SIEMPRE el usuario de la sesión. No se puede
 *    firmar en nombre de otro, que es justo lo que la regla de custodia
 *    persigue: el custodio confirma el dinero desde su propia sesión y con su
 *    propio PIN, no desde el dispositivo del vendedor.
 *  · Quien atestigua una firma presencial de un tercero también es el usuario
 *    de la sesión, porque es quien responde por ese acto.
 *
 * El PIN viaja en el cuerpo y se coteja dentro de la función SQL; nunca se
 * registra ni se devuelve.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { usuario, error } = await requerirUsuario();
  if (error) return error;

  const id = parseId((await params).id);
  if (id === null) return respuesta404("Folio no encontrado");

  const datos = (await cuerpo(request)) as Record<string, unknown>;
  const origenSesion = request.headers.get("user-agent")?.slice(0, 200) ?? null;

  if (datos.metodo === "AUTOGRAFA_PRESENCIAL") {
    const entrada = {
      ...datos,
      documentoId: id,
      atestiguaUsuario: usuario.id,
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
    origenSesion,
  } as EntradaFirmaInterna;

  return responder(
    () => firmarComoInterno(entrada),
    (estado) => NextResponse.json({ estado }),
  );
}

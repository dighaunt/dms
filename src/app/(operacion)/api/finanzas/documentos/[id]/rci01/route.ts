import { NextResponse } from "next/server";

import { parseId, requerirUsuario, respuesta404 } from "@/lib/api";
import { cuerpo, responder } from "@/lib/finanzas/api";
import {
  type EntradaDenominacion,
  type EntradaReciboCaja,
  capturarReciboCaja,
  obtenerDenominaciones,
  obtenerReciboCaja,
  registrarDenominaciones,
} from "@/lib/finanzas/cobranza";

/** Recibo de caja capturado, con su desglose de billetes. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requerirUsuario();
  if (error) return error;

  const id = parseId((await params).id);
  if (id === null) return respuesta404("Folio no encontrado");

  return responder(async () => ({
    recibo: await obtenerReciboCaja(id),
    arqueo: await obtenerDenominaciones(id),
  }));
}

/**
 * Captura del CACM-RCI-01. El cuerpo admite el desglose de denominaciones
 * junto con la cabecera porque en el papel son la misma hoja: la Parte II no
 * tiene sentido sin la Parte I. El desglose se reemplaza en bloque dentro de
 * una transacción, para que nunca quede un arqueo a medias.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { usuario, error } = await requerirUsuario();
  if (error) return error;

  const id = parseId((await params).id);
  if (id === null) return respuesta404("Folio no encontrado");

  const { denominaciones, ...datos } = (await cuerpo(request)) as Record<string, unknown> & {
    denominaciones?: unknown[];
  };

  return responder(async () => {
    const recibo = await capturarReciboCaja(id, datos as EntradaReciboCaja, usuario.id);
    const arqueo = Array.isArray(denominaciones)
      ? await registrarDenominaciones(id, denominaciones as EntradaDenominacion[])
      : await obtenerDenominaciones(id);
    return { recibo, arqueo };
  }, (dato) => NextResponse.json(dato));
}

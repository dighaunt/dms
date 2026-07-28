import { parseId, requerirUsuario, respuesta404 } from "@/lib/api";
import { cuerpo, responder } from "@/lib/finanzas/api";
import {
  type EntradaReciboNomina,
  capturarReciboNomina,
  obtenerReciboNomina,
} from "@/lib/finanzas/egresos";

/** Contenido del CACM-RCI-06, con los totales y el neto ya calculados por la base. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requerirUsuario();
  if (error) return error;

  const id = parseId((await params).id);
  if (id === null) return respuesta404("Folio no encontrado");

  return responder(() => obtenerReciboNomina(id));
}

/**
 * Captura del CACM-RCI-06 sobre un folio ya emitido.
 *
 * LOS TOTALES Y EL NETO NO SE ACEPTAN aunque vengan en el cuerpo:
 * `total_percepciones`, `total_deducciones` y `neto_pagado` son columnas
 * GENERATED ALWAYS y `capturarReciboNomina` sólo escribe las seis partidas. La
 * respuesta trae las cifras releídas de la fila guardada, así que lo que la
 * pantalla muestre después de guardar es lo que la base calculó y no una
 * segunda aritmética hecha en el navegador. Esa distinción importa: el neto es
 * lo que se le entrega a una persona y lo que ampara el pago de su salario
 * (LFT art. 804).
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { usuario, error } = await requerirUsuario();
  if (error) return error;

  const id = parseId((await params).id);
  if (id === null) return respuesta404("Folio no encontrado");

  const datos = (await cuerpo(request)) as EntradaReciboNomina;

  // El id de quien captura sale de la sesión, nunca del cuerpo.
  return responder(() => capturarReciboNomina(id, datos, usuario.id));
}

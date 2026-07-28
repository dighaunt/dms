import { parseId, requerirUsuario, respuesta404 } from "@/lib/api";
import { cuerpo, responder } from "@/lib/finanzas/api";
import {
  type EntradaIngresoServicio,
  capturarIngresoServicio,
  obtenerIngresoServicio,
} from "@/lib/finanzas/cobranza";

/** Contenido del CACM-RCI-04 tal como quedó capturado. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requerirUsuario();
  if (error) return error;

  const id = parseId((await params).id);
  if (id === null) return respuesta404("Folio no encontrado");

  return responder(() => obtenerIngresoServicio(id));
}

/**
 * Captura del CACM-RCI-04 sobre un folio ya emitido.
 *
 * El cuerpo viaja tal cual al servicio: `esquemaIngresoServicio` es quien
 * decide qué campos existen y con qué forma, y repetir aquí ese esquema sería
 * mantener dos versiones de la misma regla que un día se separan.
 *
 * A diferencia del RCI-01, este formato no lleva desglose de denominaciones
 * —el taller cobra también con tarjeta o transferencia— así que la petición es
 * una sola cabecera. Lo que sí comparte es la transferencia de custodia, y ésa
 * no es un campo: es la firma RECIBIO_CUSTODIO y se levanta desde la ficha del
 * documento.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { usuario, error } = await requerirUsuario();
  if (error) return error;

  const id = parseId((await params).id);
  if (id === null) return respuesta404("Folio no encontrado");

  const datos = (await cuerpo(request)) as EntradaIngresoServicio;

  // El id de quien captura sale de la sesión, nunca del cuerpo.
  return responder(() => capturarIngresoServicio(id, datos, usuario.id));
}

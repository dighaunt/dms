import { parseId, requerirUsuario, respuesta404 } from "@/lib/api";
import { cuerpo, responder } from "@/lib/finanzas/api";
import {
  type EntradaIngresoVehiculo,
  capturarIngresoVehiculo,
  obtenerIngresoVehiculo,
} from "@/lib/finanzas/consignacion";

/** Contenido del CACM-RCI-02, con la ficha de la unidad ya resuelta. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requerirUsuario();
  if (error) return error;

  const id = parseId((await params).id);
  if (id === null) return respuesta404("Folio no encontrado");

  return responder(() => obtenerIngresoVehiculo(id));
}

/**
 * Captura del CACM-RCI-02 sobre un folio ya emitido.
 *
 * El cuerpo viaja tal cual al servicio: la unión discriminada de
 * `esquemaIngresoVehiculo` es la que decide qué campos económicos existen para
 * el tipo de operación recibido, y repetir aquí esa forma sería mantener dos
 * versiones de la misma regla.
 *
 * Tampoco se comprueba que el tipo de operación diga lo mismo que
 * `expediente.origen`: eso lo impone `validar_ingreso_vehiculo_rci02` y su
 * mensaje llega como 409 diciendo cuál de los dos hay que corregir. Adivinarlo
 * aquí convertiría un expediente mal capturado en un dato bueno.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { usuario, error } = await requerirUsuario();
  if (error) return error;

  const id = parseId((await params).id);
  if (id === null) return respuesta404("Folio no encontrado");

  const datos = (await cuerpo(request)) as EntradaIngresoVehiculo;

  // El id de quien captura sale de la sesión, nunca del cuerpo.
  return responder(() => capturarIngresoVehiculo(id, datos, usuario.id));
}

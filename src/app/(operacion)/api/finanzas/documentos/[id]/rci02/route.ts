import { parseId, requerirUsuario, respuesta404 } from "@/lib/api";
import { cuerpo, responder } from "@/lib/finanzas/api";
import {
  type EntradaIngresoVehiculo,
  capturarIngresoVehiculo,
  obtenerIngresoVehiculo,
} from "@/lib/finanzas/consignacion";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requerirUsuario();
  if (error) return error;

  const id = parseId((await params).id);
  if (id === null) return respuesta404("Folio no encontrado");

  return responder(() => obtenerIngresoVehiculo(id));
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { usuario, error } = await requerirUsuario();
  if (error) return error;

  const id = parseId((await params).id);
  if (id === null) return respuesta404("Folio no encontrado");

  const datos = (await cuerpo(request)) as EntradaIngresoVehiculo;

  return responder(() => capturarIngresoVehiculo(id, datos, usuario.id));
}

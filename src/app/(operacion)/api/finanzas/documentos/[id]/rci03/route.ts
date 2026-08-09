import { parseId, requerirUsuario, respuesta404 } from "@/lib/api";
import { creado, cuerpo, responder } from "@/lib/finanzas/api";
import {
  type EntradaAjusteUtilidad,
  type EntradaLiquidacion,
  capturarLiquidacion,
  obtenerLiquidacion,
  registrarAjusteUtilidad,
} from "@/lib/finanzas/consignacion";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requerirUsuario();
  if (error) return error;

  const id = parseId((await params).id);
  if (id === null) return respuesta404("Folio no encontrado");

  return responder(() => obtenerLiquidacion(id));
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { usuario, error } = await requerirUsuario();
  if (error) return error;

  const id = parseId((await params).id);
  if (id === null) return respuesta404("Folio no encontrado");

  const datos = (await cuerpo(request)) as EntradaLiquidacion;

  return responder(() => capturarLiquidacion(id, datos, usuario.id));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { usuario, error } = await requerirUsuario();
  if (error) return error;

  const id = parseId((await params).id);
  if (id === null) return respuesta404("Folio no encontrado");

  const datos = (await cuerpo(request)) as EntradaAjusteUtilidad;

  return responder(async () => {

    const ajuste = await registrarAjusteUtilidad(id, datos, usuario.id);
    return { ajuste, liquidacion: await obtenerLiquidacion(id) };
  }, creado);
}

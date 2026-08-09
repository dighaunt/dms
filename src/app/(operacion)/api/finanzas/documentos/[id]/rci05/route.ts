import { parseId, requerirUsuario, respuesta404 } from "@/lib/api";
import { cuerpo, responder } from "@/lib/finanzas/api";
import {
  type EntradaValeEgreso,
  capturarValeEgreso,
  estadoFirmasVale,
  obtenerValeEgreso,
} from "@/lib/finanzas/egresos";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requerirUsuario();
  if (error) return error;

  const id = parseId((await params).id);
  if (id === null) return respuesta404("Folio no encontrado");

  return responder(async () => ({
    vale: await obtenerValeEgreso(id),
    firmas: await estadoFirmasVale(id),
  }));
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { usuario, error } = await requerirUsuario();
  if (error) return error;

  const id = parseId((await params).id);
  if (id === null) return respuesta404("Folio no encontrado");

  const datos = (await cuerpo(request)) as EntradaValeEgreso;

  return responder(() => capturarValeEgreso(id, datos, usuario.id));
}

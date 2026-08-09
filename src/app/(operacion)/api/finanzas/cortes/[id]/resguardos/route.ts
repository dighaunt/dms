import { parseId, requerirUsuario, respuesta404 } from "@/lib/api";
import { creado, cuerpo, responder } from "@/lib/finanzas/api";
import { type EntradaResguardoCorte, registrarResguardo } from "@/lib/finanzas/corte";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { usuario, error } = await requerirUsuario();
  if (error) return error;

  const id = parseId((await params).id);
  if (id === null) return respuesta404("Corte no encontrado");

  const datos = (await cuerpo(request)) as Record<string, unknown>;
  return responder(
    () => registrarResguardo(id, datos as EntradaResguardoCorte, usuario.id),
    creado,
  );
}

import { parseId, requerirUsuario, respuesta404 } from "@/lib/api";
import { creado, cuerpo, responder } from "@/lib/finanzas/api";
import { type EntradaResguardoCorte, registrarResguardo } from "@/lib/finanzas/corte";

/**
 * Declara efectivo que al cierre no está ni en el cajón ni en el banco:
 * en tránsito por depositar (inciso c) u otro resguardo (inciso d).
 *
 * La tabla no guarda quién lo declaró —el papel tampoco tiene esa casilla—,
 * pero el usuario de sesión sí se pasa al servicio: es a su nombre que se
 * rearma el corte. Nunca se toma del cuerpo de la petición.
 */
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

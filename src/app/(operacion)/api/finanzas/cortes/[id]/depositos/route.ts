import { parseId, requerirUsuario, respuesta404 } from "@/lib/api";
import { creado, cuerpo, responder } from "@/lib/finanzas/api";
import { type EntradaDepositoCorte, registrarDeposito } from "@/lib/finanzas/corte";

/**
 * Declara un depósito bancario del día (inciso b del RCI-07).
 *
 * No hay GET: lo depositado se lee desde la pantalla del corte con
 * `ubicacionEfectivo`, que lo deriva junto con el arqueo y los resguardos. Un
 * segundo camino de lectura serviría para que la Parte II y la ubicación del
 * efectivo llegaran a contar cosas distintas.
 *
 * `registrarDeposito` rearma el corte dentro de la misma transacción —un
 * depósito es efectivo que salió del cajón y cambia el saldo calculado— y sobre
 * un corte ya cerrado el disparador de la migración 037 lo impide; ese P0001
 * viaja tal cual y `responder` lo convierte en 409 con su mensaje.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { usuario, error } = await requerirUsuario();
  if (error) return error;

  const id = parseId((await params).id);
  if (id === null) return respuesta404("Corte no encontrado");

  const datos = (await cuerpo(request)) as Record<string, unknown>;
  return responder(
    () => registrarDeposito(id, datos as EntradaDepositoCorte, usuario.id),
    creado,
  );
}

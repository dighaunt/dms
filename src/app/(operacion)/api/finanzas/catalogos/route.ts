import { requerirUsuario } from "@/lib/api";
import { responder } from "@/lib/finanzas/api";
import {
  conceptosCobro,
  conceptosEgreso,
  formasPago,
  listarSucursales,
  tienePinDeFirma,
} from "@/lib/finanzas/catalogos";

/**
 * Todo lo que una pantalla de captura necesita para armar sus selectores, en
 * una sola llamada. Incluye si el usuario de la sesión ya tiene PIN de firma:
 * sin él no podrá rubricar nada, y es mejor decírselo antes de que capture.
 */
export async function GET() {
  const { usuario, error } = await requerirUsuario();
  if (error) return error;

  return responder(async () => ({
    sucursales: await listarSucursales(),
    conceptosCobro: await conceptosCobro(),
    conceptosEgreso: await conceptosEgreso(),
    formasPago: await formasPago(),
    usuario: { id: usuario.id, nombre: usuario.nombre, nivel: usuario.nivel },
    tienePin: await tienePinDeFirma(usuario.id),
  }));
}

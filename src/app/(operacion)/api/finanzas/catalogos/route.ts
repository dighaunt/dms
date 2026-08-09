import { requerirUsuario } from "@/lib/api";
import { responder } from "@/lib/finanzas/api";
import {
  conceptosCobro,
  conceptosEgreso,
  formasPago,
  listarSucursales,
  tienePinDeFirma,
} from "@/lib/finanzas/catalogos";
import { listarPersonas, listarSocios } from "@/lib/finanzas/personas";

export async function GET() {
  const { usuario, error } = await requerirUsuario();
  if (error) return error;

  return responder(async () => ({
    sucursales: await listarSucursales(),
    conceptosCobro: await conceptosCobro(),
    conceptosEgreso: await conceptosEgreso(),
    formasPago: await formasPago(),
    
    personas: await listarPersonas({ limite: 500 }),
    
    socios: await listarSocios(),
    usuario: { id: usuario.id, nombre: usuario.nombre, nivel: usuario.nivel },
    tienePin: await tienePinDeFirma(usuario.id),
  }));
}

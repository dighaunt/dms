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
    /**
     * El catálogo de beneficiarios, para que el vale se capture eligiendo en
     * lugar de tecleando. Van las activas y con un tope alto: esta llamada
     * arma el selector completo de una sola vez, y quien necesite buscar
     * dentro de un catálogo mayor tiene `GET /catalogos/personas?busqueda=`.
     */
    personas: await listarPersonas({ limite: 500 }),
    /**
     * Sólo los socios VIGENTES: es lo único que un retiro de utilidades puede
     * ofrecer, y `exigir_socio_vigente` lo rechazaría de todas formas. El
     * registro completo, con los dados de baja, se lee en /catalogos/socios.
     */
    socios: await listarSocios(),
    usuario: { id: usuario.id, nombre: usuario.nombre, nivel: usuario.nivel },
    tienePin: await tienePinDeFirma(usuario.id),
  }));
}

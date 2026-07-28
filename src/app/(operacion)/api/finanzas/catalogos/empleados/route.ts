import { requerirN3, requerirUsuario } from "@/lib/api";
import { creado, cuerpo, numeroDeConsulta, responder, textoDeConsulta } from "@/lib/finanzas/api";
import {
  type EntradaCrearEmpleado,
  type FiltroEmpleados,
  crearEmpleado,
  listarEmpleados,
} from "@/lib/finanzas/catalogos";

const MENSAJE_N3 = "Solo un administrador global (N3) puede dar de alta personal";

/**
 * Personal, filtrable por sucursal. Leerlo basta con tener sesión: el selector
 * de vendedor del RCI-01 y el de trabajador del RCI-06 se arman con esto.
 *
 * `incluirInactivos=1` es para la pantalla de administración; una captura
 * nueva sólo debe poder elegir a quien sigue dado de alta.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const { error } = await requerirUsuario();
  if (error) return error;

  const filtro = {
    sucursalId: numeroDeConsulta(url, "sucursal"),
    soloActivos: textoDeConsulta(url, "incluirInactivos") !== "1",
  } as FiltroEmpleados;

  return responder(() => listarEmpleados(filtro));
}

/**
 * Alta de una ficha de personal.
 *
 * Ojo con los dos campos que se parecen: `usuarioId` es de quién es la ficha
 * —opcional, sólo cuando esa persona además opera el sistema— y `usuario` es
 * quien la está dando de alta, que sale de la sesión y jamás del cuerpo.
 *
 * Que `usuarioId` sea opcional es la regla, no una comodidad: el trabajador
 * que cobra un recibo de nómina o el vendedor que aparece en un RCI-01 casi
 * nunca tiene cuenta, y exigirle una obligaría a inventar usuarios falsos para
 * poder emitir su recibo.
 */
export async function POST(request: Request) {
  const { usuario, error } = await requerirN3(MENSAJE_N3);
  if (error) return error;

  const datos = (await cuerpo(request)) as Record<string, unknown>;
  const entrada = { ...datos, usuario: usuario.id } as EntradaCrearEmpleado;

  return responder(() => crearEmpleado(entrada), creado);
}

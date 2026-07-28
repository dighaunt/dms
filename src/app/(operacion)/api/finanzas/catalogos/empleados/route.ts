import { NextResponse } from "next/server";

import { requerirN3, requerirUsuario, respuesta404 } from "@/lib/api";
import { creado, cuerpo, numeroDeConsulta, responder, textoDeConsulta } from "@/lib/finanzas/api";
import {
  type EntradaActualizarEmpleado,
  type EntradaCrearEmpleado,
  type FiltroEmpleados,
  activarEmpleado,
  actualizarEmpleado,
  crearEmpleado,
  desactivarEmpleado,
  listarEmpleados,
} from "@/lib/finanzas/catalogos";

const MENSAJE_N3 =
  "Solo un administrador global (N3) puede dar de alta, corregir o dar de baja al personal";

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

/**
 * Corrige una ficha, o da de baja y reactiva.
 *
 * Dar de baja NO es borrar: es inhabilitar. La ficha se queda porque cada
 * RCI-01 que esa persona cobró la cita por su nombre, y leer un folio de hace
 * tres años exige poder resolver quién era el vendedor. Borrarla sería además
 * imposible —la referencian los recibos y la nómina— y dejaría huecos
 * inexplicables. Lo único que cambia es que deja de ofrecerse en una captura
 * nueva; por eso el listado la sigue devolviendo con `incluirInactivos=1`.
 *
 * Se distingue por el cuerpo: `{ id, activo }` es baja o reactivación,
 * cualquier otro cuerpo es el formulario completo. Se exige el booleano
 * explícito en lugar de interpretar lo que llegue, porque un valor ausente
 * leído como "falso" daría de baja a alguien que nadie pidió dar de baja.
 */
export async function PATCH(request: Request) {
  const { usuario, error } = await requerirN3(MENSAJE_N3);
  if (error) return error;

  const datos = (await cuerpo(request)) as Record<string, unknown>;
  const id = Number(datos.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Indica de qué ficha de personal se trata." }, { status: 400 });
  }

  const noEncontrado = (empleado: unknown) =>
    empleado ? NextResponse.json(empleado) : respuesta404("Esa ficha de personal no existe");

  if (typeof datos.activo === "boolean") {
    const activo = datos.activo;
    return responder(
      () => (activo ? activarEmpleado(id, usuario.id) : desactivarEmpleado(id, usuario.id)),
      noEncontrado,
    );
  }

  return responder(
    () => actualizarEmpleado(id, datos as unknown as EntradaActualizarEmpleado),
    noEncontrado,
  );
}

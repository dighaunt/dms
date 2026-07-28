import { NextResponse } from "next/server";

import { requerirN3, requerirUsuario, respuesta404 } from "@/lib/api";
import { creado, cuerpo, responder, textoDeConsulta } from "@/lib/finanzas/api";
import {
  type EntradaCrearSucursal,
  activarSucursal,
  crearSucursal,
  desactivarSucursal,
  listarSucursales,
} from "@/lib/finanzas/catalogos";

/**
 * Catálogo de sucursales.
 *
 * Leerlo lo puede hacer cualquiera con sesión —todo selector de captura lo
 * necesita para armar sus opciones—, pero escribirlo no: dar de alta una
 * sucursal abre una serie de folios nueva, y darla de baja apaga la que ya
 * corría. Eso es administración del sistema, así que las escrituras piden N3.
 */
const MENSAJE_N3 = "Solo un administrador global (N3) puede dar de alta o de baja sucursales";

/**
 * Por omisión sólo las que siguen operando, que es lo único que una captura
 * puede ofrecer. `incluirInactivas=1` agrega las dadas de baja, porque la
 * pantalla de administración necesita verlas para poder reactivarlas.
 */
export async function GET(request: Request) {
  const { error } = await requerirUsuario();
  if (error) return error;

  const url = new URL(request.url);
  const incluirInactivas = textoDeConsulta(url, "incluirInactivas") === "1";

  return responder(() => listarSucursales({ soloActivas: !incluirInactivas }));
}

/**
 * Alta de sucursal.
 *
 * No hay PUT que cambie la clave y no es un olvido: la clave viaja dentro del
 * folio (CACM-RCI-01-MTY-0001) y queda impresa en todo lo ya emitido, así que
 * cambiarla reescribiría la cita de documentos que circulan en papel.
 */
export async function POST(request: Request) {
  const { usuario, error } = await requerirN3(MENSAJE_N3);
  if (error) return error;

  const datos = (await cuerpo(request)) as Record<string, unknown>;
  // El id de sesión va después del spread para que pise cualquier "usuario"
  // que venga en el cuerpo: quien da el alta es quien está operando.
  const entrada = { ...datos, usuario: usuario.id } as EntradaCrearSucursal;

  return responder(() => crearSucursal(entrada), creado);
}

/**
 * Reactiva o da de baja una sucursal. La baja no borra ni oculta nada: los
 * folios ya emitidos siguen citándola y el histórico se lee igual; lo único
 * que cambia es que deja de poder abrirse un folio nuevo en ella.
 */
export async function PATCH(request: Request) {
  const { error } = await requerirN3(MENSAJE_N3);
  if (error) return error;

  const datos = (await cuerpo(request)) as Record<string, unknown>;

  // Se exige el booleano explícito en lugar de interpretar lo que llegue: un
  // valor ausente que se leyera como "falso" daría de baja una sucursal que
  // nadie pidió dar de baja.
  if (typeof datos.activa !== "boolean") {
    return NextResponse.json(
      { error: "Indica si la sucursal queda activa o inactiva." },
      { status: 400 },
    );
  }

  const id = Number(datos.id);
  const activa = datos.activa;

  return responder(
    () => (activa ? activarSucursal(id) : desactivarSucursal(id)),
    (sucursal) => (sucursal ? NextResponse.json(sucursal) : respuesta404("La sucursal no existe")),
  );
}

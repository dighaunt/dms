import { requerirUsuario } from "@/lib/api";
import {
  creado,
  cuerpo,
  numeroDeConsulta,
  requerirNivelMinimo,
  responder,
} from "@/lib/finanzas/api";
import {
  type EntradaRepartoUtilidades,
  anticiposDeSocios,
  listarRepartosUtilidades,
  registrarRepartoUtilidades,
} from "@/lib/finanzas/egresos";

/**
 * Reparto formal de utilidades — la salida que le faltaba a la regla 5.
 *
 * Mientras no exista un reparto que lo respalde, todo retiro de socio es
 * ANTICIPO A CUENTA (LGSM art. 19) y `v_anticipo_utilidades_socio` lo cuenta
 * como saldo por comprobar. Sin esta ruta ese saldo sólo podía subir: la vista
 * sabía acusar y no tenía manera de absolver.
 *
 * Quién puede autorizarlo: N3. El reparto no es una captura de operación sino
 * la aplicación de un acuerdo de asamblea —lo autoriza un socio o el Gerente
 * General—, y N3 es el nivel con el que ese perfil entra al sistema. La
 * consulta, en cambio, queda abierta a cualquier sesión: la posición de cada
 * socio es lo que la pantalla de egresos ya enseña antes de entregar el dinero.
 */
const MENSAJE_AUTORIZACION =
  "El reparto formal de utilidades lo autoriza un socio o el Gerente General (nivel N3): es la aplicación de un acuerdo de asamblea sobre un balance aprobado, no una captura de operación";

/** Los repartos asentados y la posición de cada socio frente a ellos. */
export async function GET(request: Request) {
  const { error } = await requerirUsuario();
  if (error) return error;

  const limite = numeroDeConsulta(new URL(request.url), "limite");

  return responder(async () => ({
    repartos: await listarRepartosUtilidades(limite === undefined ? {} : { limite }),
    socios: await anticiposDeSocios(),
  }));
}

/**
 * Asienta el reparto y sus asignaciones por socio, en una sola transacción.
 *
 * El cuerpo viaja tal cual: la autoridad de validación es
 * `esquemaRepartoUtilidades` del servicio, que además de los campos comprueba
 * que las asignaciones no excedan la utilidad que el balance arroja. Un
 * ejercicio se reparte una sola vez —la UNIQUE lo devuelve como 409— y las dos
 * tablas son inmutables, así que aquí no hay PUT ni DELETE que ofrecer: un
 * reparto equivocado no se corrige, se complementa con otro.
 */
export async function POST(request: Request) {
  const { usuario, error } = await requerirNivelMinimo("N3", MENSAJE_AUTORIZACION);
  if (error) return error;

  const datos = (await cuerpo(request)) as EntradaRepartoUtilidades;

  // Quien autoriza es el usuario de la sesión, nunca un id del cuerpo: su
  // nombre queda impreso como responsable del acuerdo y no se puede reasignar.
  return responder(() => registrarRepartoUtilidades(datos, usuario.id), creado);
}

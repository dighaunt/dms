import { parseId, requerirUsuario, respuesta404 } from "@/lib/api";
import { cuerpo, responder } from "@/lib/finanzas/api";
import {
  type EntradaValeEgreso,
  capturarValeEgreso,
  estadoFirmasVale,
  obtenerValeEgreso,
} from "@/lib/finanzas/egresos";

/**
 * Contenido del CACM-RCI-05 junto con el estado de sus tres firmas.
 *
 * Las dos cosas viajan juntas porque un vale sin sus firmas no autoriza nada:
 * preguntar por el importe sin poder decir quién falta por firmar describiría
 * una salida de efectivo como si ya estuviera consentida. `estadoFirmasVale`
 * devuelve null cuando el folio no es un vale, y así se propaga.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requerirUsuario();
  if (error) return error;

  const id = parseId((await params).id);
  if (id === null) return respuesta404("Folio no encontrado");

  return responder(async () => ({
    vale: await obtenerValeEgreso(id),
    firmas: await estadoFirmasVale(id),
  }));
}

/**
 * Captura del CACM-RCI-05 sobre un folio ya emitido.
 *
 * El cuerpo viaja tal cual al servicio. Las tres reglas propias del vale
 * —concepto OTRO que obliga a escribir cuál, pago de nómina que obliga a citar
 * el recibo del trabajador, retiro de socio que obliga a decir qué socio— las
 * comprueba `esquemaValeEgreso` y, en último término, los CHECK de la tabla.
 * Aquí no se repiten: una cuarta copia de la misma regla sólo sirve para
 * divergir.
 *
 * Tampoco se atrapa el aviso por retiro de socio sin reparto que lo respalde.
 * Lo levanta el disparador `vale_egreso_avisa_retiro` al insertar y es un
 * AVISO, no un bloqueo: la empresa puede necesitar entregar el dinero; lo que
 * no puede es presentarlo como utilidad ya repartida (LGSM art. 19).
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { usuario, error } = await requerirUsuario();
  if (error) return error;

  const id = parseId((await params).id);
  if (id === null) return respuesta404("Folio no encontrado");

  const datos = (await cuerpo(request)) as EntradaValeEgreso;

  // El id de quien captura sale de la sesión, nunca del cuerpo.
  return responder(() => capturarValeEgreso(id, datos, usuario.id));
}

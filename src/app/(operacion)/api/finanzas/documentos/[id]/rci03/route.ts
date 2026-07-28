import { parseId, requerirUsuario, respuesta404 } from "@/lib/api";
import { creado, cuerpo, responder } from "@/lib/finanzas/api";
import {
  type EntradaAjusteUtilidad,
  type EntradaLiquidacion,
  capturarLiquidacion,
  obtenerLiquidacion,
  registrarAjusteUtilidad,
} from "@/lib/finanzas/consignacion";

/** Liquidación completa: cabecera, renglones de gasto y ajustes. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requerirUsuario();
  if (error) return error;

  const id = parseId((await params).id);
  if (id === null) return respuesta404("Folio no encontrado");

  return responder(() => obtenerLiquidacion(id));
}

/**
 * Captura del CACM-RCI-03. Los gastos van en el mismo cuerpo que la cabecera
 * porque en el papel son el mismo renglonaje de la Parte II, y porque la
 * utilidad sólo tiene sentido junto a los gastos que la producen: guardarlos en
 * dos viajes dejaría una utilidad intermedia que nadie capturó nunca.
 *
 * Ni `gastosTotal` ni `utilidadNeta` se aceptan del cuerpo aunque vengan: el
 * servicio no los escribe —la primera la mantiene un disparador y la segunda es
 * una columna GENERATED—, así que la cifra que se devuelve es siempre la que
 * calculó la base sobre los renglones realmente guardados.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { usuario, error } = await requerirUsuario();
  if (error) return error;

  const id = parseId((await params).id);
  if (id === null) return respuesta404("Folio no encontrado");

  const datos = (await cuerpo(request)) as EntradaLiquidacion;

  return responder(() => capturarLiquidacion(id, datos, usuario.id));
}

/**
 * Asienta un ajuste sobre la utilidad ya calculada.
 *
 * Es POST y no PUT a propósito: un ajuste NO edita la liquidación, la
 * acompaña. `utilidad_neta` sigue siendo la cifra reproducible desde precio,
 * monto del consignante y gastos —y la que el consignante firmó—, mientras el
 * ajuste queda como un hecho aparte, inmutable, con autor, fecha y nota de
 * auditoría. Por eso cada llamada agrega un renglón en vez de sustituir el
 * anterior.
 *
 * Se devuelve además la liquidación recién leída para que la pantalla muestre
 * la utilidad ajustada sin tener que sumarla por su cuenta.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { usuario, error } = await requerirUsuario();
  if (error) return error;

  const id = parseId((await params).id);
  if (id === null) return respuesta404("Folio no encontrado");

  const datos = (await cuerpo(request)) as EntradaAjusteUtilidad;

  return responder(async () => {
    // Quien autoriza el ajuste es el usuario de la sesión: es su nombre el que
    // queda impreso junto a la nota que lo justifica.
    const ajuste = await registrarAjusteUtilidad(id, datos, usuario.id);
    return { ajuste, liquidacion: await obtenerLiquidacion(id) };
  }, creado);
}

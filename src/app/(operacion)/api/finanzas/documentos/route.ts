import { requerirUsuario } from "@/lib/api";
import { creado, cuerpo, numeroDeConsulta, responder, textoDeConsulta } from "@/lib/finanzas/api";
import {
  type EntradaEmitirFolio,
  type FiltroDocumentos,
  emitirFolio,
  listarDocumentos,
} from "@/lib/finanzas/documentos";

/** Listado de folios financieros, filtrable por sucursal, tipo, estado y fechas. */
export async function GET(request: Request) {
  const { error } = await requerirUsuario();
  if (error) return error;

  const url = new URL(request.url);
  // Los valores de la barra de direcciones son texto suelto; el esquema del
  // servicio es quien decide si "tipo" o "estado" son válidos, y responde 400
  // con el detalle cuando no lo son.
  const filtro = {
    sucursalId: numeroDeConsulta(url, "sucursal"),
    tipo: textoDeConsulta(url, "tipo"),
    estado: textoDeConsulta(url, "estado"),
    desde: textoDeConsulta(url, "desde"),
    hasta: textoDeConsulta(url, "hasta"),
  } as FiltroDocumentos;

  return responder(() => listarDocumentos(filtro));
}

/**
 * Emite un folio consecutivo. El consecutivo corre por sucursal y por tipo, y
 * lo entrega traza.emitir_folio_financiero dentro de su propia transacción:
 * dos capturas simultáneas no pueden obtener el mismo número ni saltarse uno.
 */
export async function POST(request: Request) {
  const { usuario, error } = await requerirUsuario();
  if (error) return error;

  const datos = (await cuerpo(request)) as Record<string, unknown>;
  // El usuario de la sesión pisa cualquier "usuario" que venga en el cuerpo:
  // un folio se emite siempre a nombre de quien está operando.
  const entrada = { ...datos, usuario: usuario.id } as EntradaEmitirFolio;

  return responder(() => emitirFolio(entrada), creado);
}

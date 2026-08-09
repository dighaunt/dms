import { requerirUsuario } from "@/lib/api";
import { creado, cuerpo, numeroDeConsulta, responder, textoDeConsulta } from "@/lib/finanzas/api";
import {
  type EntradaEmitirFolio,
  type FiltroDocumentos,
  emitirFolio,
  listarDocumentos,
} from "@/lib/finanzas/documentos";

export async function GET(request: Request) {
  const { error } = await requerirUsuario();
  if (error) return error;

  const url = new URL(request.url);

  
  const filtro = {
    sucursalId: numeroDeConsulta(url, "sucursal"),
    tipo: textoDeConsulta(url, "tipo"),
    estado: textoDeConsulta(url, "estado"),
    desde: textoDeConsulta(url, "desde"),
    hasta: textoDeConsulta(url, "hasta"),
  } as FiltroDocumentos;

  return responder(() => listarDocumentos(filtro));
}

export async function POST(request: Request) {
  const { usuario, error } = await requerirUsuario();
  if (error) return error;

  const datos = (await cuerpo(request)) as Record<string, unknown>;

  const entrada = { ...datos, usuario: usuario.id } as EntradaEmitirFolio;

  return responder(() => emitirFolio(entrada), creado);
}

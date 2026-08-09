import { requerirUsuario } from "@/lib/api";
import {
  creado,
  cuerpo,
  numeroDeConsulta,
  requerirNivelMinimo,
  responder,
  textoDeConsulta,
} from "@/lib/finanzas/api";
import {
  type EntradaCrearPersona,
  type FiltroPersonas,
  crearPersona,
  listarPersonas,
} from "@/lib/finanzas/personas";

const MENSAJE_N3 =
  "Solo un administrador global (N3) puede dar de alta personas en el catálogo de beneficiarios";

export async function GET(request: Request) {
  const { error } = await requerirUsuario();
  if (error) return error;

  const url = new URL(request.url);
  const filtro = {
    busqueda: textoDeConsulta(url, "busqueda"),
    categoria: textoDeConsulta(url, "categoria"),
    soloActivas: textoDeConsulta(url, "incluirInactivas") !== "1",
    limite: numeroDeConsulta(url, "limite"),
  } as FiltroPersonas;

  return responder(() => listarPersonas(filtro));
}

export async function POST(request: Request) {
  const { usuario, error } = await requerirNivelMinimo("N3", MENSAJE_N3);
  if (error) return error;

  const datos = (await cuerpo(request)) as EntradaCrearPersona;

  return responder(() => crearPersona(datos, usuario.id), creado);
}

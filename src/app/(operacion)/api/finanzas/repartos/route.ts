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

const MENSAJE_AUTORIZACION =
  "El reparto formal de utilidades lo autoriza un socio o el Gerente General (nivel N3): es la aplicación de un acuerdo de asamblea sobre un balance aprobado, no una captura de operación";

export async function GET(request: Request) {
  const { error } = await requerirUsuario();
  if (error) return error;

  const limite = numeroDeConsulta(new URL(request.url), "limite");

  return responder(async () => ({
    repartos: await listarRepartosUtilidades(limite === undefined ? {} : { limite }),
    socios: await anticiposDeSocios(),
  }));
}

export async function POST(request: Request) {
  const { usuario, error } = await requerirNivelMinimo("N3", MENSAJE_AUTORIZACION);
  if (error) return error;

  const datos = (await cuerpo(request)) as EntradaRepartoUtilidades;

  
  return responder(() => registrarRepartoUtilidades(datos, usuario.id), creado);
}

import { requerirUsuario } from "@/lib/api";
import { numeroDeConsulta, responder } from "@/lib/finanzas/api";
import { custodiaPendiente } from "@/lib/finanzas/cobranza";

export async function GET(request: Request) {
  const { error } = await requerirUsuario();
  if (error) return error;

  const url = new URL(request.url);
  return responder(() =>
    custodiaPendiente({
      sucursalId: numeroDeConsulta(url, "sucursal"),
      horasMinimas: numeroDeConsulta(url, "horas"),
    }),
  );
}

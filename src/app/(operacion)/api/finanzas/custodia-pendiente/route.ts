import { requerirUsuario } from "@/lib/api";
import { numeroDeConsulta, responder } from "@/lib/finanzas/api";
import { custodiaPendiente } from "@/lib/finanzas/cobranza";

/**
 * Dinero que un vendedor declaró haber entregado y que ningún custodio ha
 * confirmado todavía. Mientras aparezca aquí NO es "dinero seguro en la
 * empresa": sigue bajo responsabilidad de quien lo entregó, y así debe leerse
 * en pantalla.
 */
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

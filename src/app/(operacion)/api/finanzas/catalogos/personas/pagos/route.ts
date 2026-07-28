import { requerirUsuario } from "@/lib/api";
import { responder } from "@/lib/finanzas/api";
import { pagosPorPersona } from "@/lib/finanzas/personas";

/**
 * Cuánto se le ha pagado a cada persona del catálogo.
 *
 * Es la razón de ser del catálogo dicha en una sola consulta: mientras el
 * beneficiario fue texto libre, "Refaccionaria del Norte" y "Refaccionaria del
 * Nte." eran dos proveedores distintos y ninguno tenía historial.
 *
 * Sólo cuenta vales FIRMADOS —un borrador no entregó dinero— e incluye a quien
 * no ha cobrado nunca, porque un listado que sólo enumera a los que ya
 * cobraron no deja ver al proveedor dado de alta al que nadie ha pagado.
 *
 * Este segmento es fijo, así que Next lo resuelve antes que `[id]`: no hay
 * manera de que una persona con id "pagos" lo tape.
 */
export async function GET() {
  const { error } = await requerirUsuario();
  if (error) return error;

  return responder(() => pagosPorPersona());
}

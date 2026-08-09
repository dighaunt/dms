import { requerirUsuario } from "@/lib/api";
import { responder } from "@/lib/finanzas/api";
import { pagosPorPersona } from "@/lib/finanzas/personas";

export async function GET() {
  const { error } = await requerirUsuario();
  if (error) return error;

  return responder(() => pagosPorPersona());
}

import { requerirUsuario } from "@/lib/api";
import { creado, cuerpo, numeroDeConsulta, responder, textoDeConsulta } from "@/lib/finanzas/api";
import {
  type EntradaAbrirCorte,
  abrirCorte,
  corteDelDia,
  foliosPendientesDelDia,
} from "@/lib/finanzas/corte";

export async function GET(request: Request) {
  const { error } = await requerirUsuario();
  if (error) return error;

  const url = new URL(request.url);
  const sucursalId = numeroDeConsulta(url, "sucursal");
  const fecha = textoDeConsulta(url, "fecha") ?? new Date().toISOString().slice(0, 10);

  return responder(async () => ({
    corte: sucursalId ? await corteDelDia(sucursalId, fecha) : null,
    pendientes: sucursalId ? await foliosPendientesDelDia(sucursalId, fecha) : [],
    fecha,
  }));
}

export async function POST(request: Request) {
  const { usuario, error } = await requerirUsuario();
  if (error) return error;

  const datos = (await cuerpo(request)) as Record<string, unknown>;
  return responder(() => abrirCorte(datos as EntradaAbrirCorte, usuario.id), creado);
}

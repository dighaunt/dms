import { requerirUsuario } from "@/lib/api";
import { creado, cuerpo, numeroDeConsulta, responder, textoDeConsulta } from "@/lib/finanzas/api";
import {
  type EntradaAbrirCorte,
  abrirCorte,
  corteDelDia,
  foliosPendientesDelDia,
} from "@/lib/finanzas/corte";

/**
 * Corte de una sucursal y fecha, junto con los folios del día que siguen sin
 * firmar. Ese segundo dato es el que permite explicar en pantalla POR QUÉ no
 * se puede cerrar el día, en vez de limitarse a rechazar el cierre.
 */
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

/** Abre el corte del día: emite su folio RCI-07 y crea la cabecera. */
export async function POST(request: Request) {
  const { usuario, error } = await requerirUsuario();
  if (error) return error;

  const datos = (await cuerpo(request)) as Record<string, unknown>;
  return responder(() => abrirCorte(datos as EntradaAbrirCorte, usuario.id), creado);
}

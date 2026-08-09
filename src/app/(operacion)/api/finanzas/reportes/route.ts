import { z } from "zod";

import { requerirUsuario } from "@/lib/api";
import { numeroDeConsulta, responder, textoDeConsulta } from "@/lib/finanzas/api";
import {
  CLAVES_REPORTE,
  type EntradaRangoReporte,
  egresosPorTipo,
  historialDiferencias,
  ingresosPorTipo,
  panelDeReportes,
  posicionEfectivo,
  rangoPorOmision,
  utilidadesPendientesReparto,
} from "@/lib/finanzas/reportes";

const REPORTES = {
  ingresos: ingresosPorTipo,
  egresos: egresosPorTipo,
  diferencias: historialDiferencias,
  posicion: posicionEfectivo,
  socios: utilidadesPendientesReparto,
} as const;

const esquemaClave = z.enum(CLAVES_REPORTE);

export async function GET(request: Request) {
  const { error } = await requerirUsuario();
  if (error) return error;

  const url = new URL(request.url);
  const omision = rangoPorOmision();

  
  const rango = {
    sucursalId: numeroDeConsulta(url, "sucursal") ?? null,
    desde: textoDeConsulta(url, "desde") ?? omision.desde,
    hasta: textoDeConsulta(url, "hasta") ?? omision.hasta,
  } as EntradaRangoReporte;

  const clave = textoDeConsulta(url, "reporte");

  return responder(async () => {
    if (clave === undefined) return panelDeReportes(rango);
    return REPORTES[esquemaClave.parse(clave)](rango);
  });
}

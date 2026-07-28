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

/** Un reporte por clave; sin clave se devuelven los cinco de una vez. */
const REPORTES = {
  ingresos: ingresosPorTipo,
  egresos: egresosPorTipo,
  diferencias: historialDiferencias,
  posicion: posicionEfectivo,
  socios: utilidadesPendientesReparto,
} as const;

const esquemaClave = z.enum(CLAVES_REPORTE);

/**
 * Los cinco reportes de dirección.
 *
 * Todos comparten el mismo filtro —sucursal y rango de fechas— y todos leen
 * únicamente documentos FIRMADOS. Sin sucursal el reporte sale consolidado de
 * todas, que es la lectura que pide un socio.
 *
 * El rango no se valida aquí: `esquemaRangoReporte` decide si las fechas
 * existen y si van en orden, y `responder()` traduce su ZodError a un 400 con
 * el campo que falla. Repetir esa validación en la ruta sería garantizar que
 * un día las dos versiones digan cosas distintas.
 */
export async function GET(request: Request) {
  const { error } = await requerirUsuario();
  if (error) return error;

  const url = new URL(request.url);
  const omision = rangoPorOmision();

  // Los valores de la barra de direcciones son texto suelto; el esquema del
  // servicio es quien decide si el rango es válido.
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

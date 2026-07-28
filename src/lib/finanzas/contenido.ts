import "server-only";

import { obtenerDenominaciones, obtenerIngresoServicio, obtenerReciboCaja } from "@/lib/finanzas/cobranza";
import { obtenerCorte, detalleCorte } from "@/lib/finanzas/corte";
import { calcularHashContenido, obtenerDocumento } from "@/lib/finanzas/documentos";
import { obtenerReciboNomina, obtenerValeEgreso } from "@/lib/finanzas/egresos";

/**
 * Huella del contenido que se está firmando.
 *
 * El hash NO puede venir del cliente. Si el navegador eligiera el valor, la
 * huella dejaría de probar nada: quien altere el documento mandaría
 * simplemente el hash del texto alterado. Se calcula aquí, en el servidor,
 * leyendo de la base el mismo contenido que la persona tiene delante.
 *
 * Cada tipo aporta su detalle; si alguno no lo tuviera, se firma al menos la
 * cabecera —folio, tipo, sucursal y estado—, que ya es un hecho verificable.
 */
export async function hashDelDocumento(documentoId: number): Promise<string> {
  const documento = await obtenerDocumento(documentoId);
  if (!documento) {
    throw new Error("El documento que intentas firmar no existe");
  }

  const cabecera = {
    folio: documento.folioCompleto,
    tipo: documento.tipoCodigo,
    sucursal: documento.sucursalId,
    consecutivo: documento.consecutivo,
    complementaA: documento.complementaA,
  };

  switch (documento.tipoCodigo) {
    case "CACM-RCI-01":
      return calcularHashContenido({
        cabecera,
        recibo: await obtenerReciboCaja(documentoId),
        arqueo: await obtenerDenominaciones(documentoId),
      });
    case "CACM-RCI-04":
      return calcularHashContenido({
        cabecera,
        servicio: await obtenerIngresoServicio(documentoId),
      });
    case "CACM-RCI-05":
      return calcularHashContenido({ cabecera, vale: await obtenerValeEgreso(documentoId) });
    case "CACM-RCI-06":
      return calcularHashContenido({ cabecera, nomina: await obtenerReciboNomina(documentoId) });
    case "CACM-RCI-07":
      return calcularHashContenido({
        cabecera,
        corte: await obtenerCorte(documentoId),
        detalle: await detalleCorte(documentoId),
      });
    default:
      return calcularHashContenido({ cabecera });
  }
}

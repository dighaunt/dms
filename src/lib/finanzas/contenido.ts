import "server-only";

import { obtenerDenominaciones, obtenerIngresoServicio, obtenerReciboCaja } from "@/lib/finanzas/cobranza";
import { obtenerIngresoVehiculo, obtenerLiquidacion } from "@/lib/finanzas/consignacion";
import { obtenerCorte, detalleCorte } from "@/lib/finanzas/corte";
import { calcularHashContenido, obtenerDocumento } from "@/lib/finanzas/documentos";
import { obtenerReciboNomina, obtenerValeEgreso } from "@/lib/finanzas/egresos";

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

    
    case "CACM-RCI-02":
      return calcularHashContenido({
        cabecera,
        ingreso: await obtenerIngresoVehiculo(documentoId),
      });

    
    
    case "CACM-RCI-03":
      return calcularHashContenido({
        cabecera,
        liquidacion: await obtenerLiquidacion(documentoId),
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

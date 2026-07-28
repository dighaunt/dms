import "server-only";

import { obtenerDenominaciones, obtenerIngresoServicio, obtenerReciboCaja } from "@/lib/finanzas/cobranza";
import { obtenerIngresoVehiculo, obtenerLiquidacion } from "@/lib/finanzas/consignacion";
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
 * Cada tipo aporta su detalle. El caso `default` firma sólo la cabecera, y por
 * eso NO debe alcanzarlo ningún formato con dinero dentro: firmar la cabecera
 * es firmar el número de folio, no la cantidad. Los siete formatos del manual
 * están enumerados abajo precisamente para que agregar un octavo obligue a
 * decidir qué se firma de él.
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
    // El propietario que entrega su unidad consiente un precio pactado, un
    // mínimo de venta y una comisión. Firmar sólo la cabecera dejaba esas tres
    // cifras fuera de la huella, que es tanto como no tenerla.
    case "CACM-RCI-02":
      return calcularHashContenido({
        cabecera,
        ingreso: await obtenerIngresoVehiculo(documentoId),
      });
    // El sitio donde más pesaba el hueco: es el documento en el que un tercero
    // declara recibir una cantidad. Entran los gastos y los ajustes porque
    // ambos mueven la utilidad neta, y quien firma después del consignante
    // tiene que estar firmando la misma resta que él vio.
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

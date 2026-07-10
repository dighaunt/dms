// Etiquetas y presentación de los estatus estándar del M-01.

export const ETIQUETA_ESTADO_UNIDAD: Record<string, string> = {
  EN_RECEPCION: "En recepción",
  EN_INSPECCION: "En inspección",
  EXPEDIENTE_INCOMPLETO: "Expediente incompleto",
  LISTO_PARA_VENTA: "Listo para venta",
  APARTADA: "Apartada",
  VENDIDA_PEND_ENTREGA: "Vendida, pend. entrega",
  ENTREGADA: "Entregada",
  DEVUELTA_CONSIGNANTE: "Devuelta al consignante",
  BAJA: "Baja",
};

export const ETIQUETA_ESTADO_F06: Record<string, string> = {
  INCOMPLETO: "Incompleto",
  COMPLETO: "Completo",
  LISTO_PARA_VENTA: "Listo para venta",
};

// Punto de color discreto estilo WorkOS por estado de unidad.
export const PUNTO_ESTADO_UNIDAD: Record<string, string> = {
  EN_RECEPCION: "bg-zinc-400",
  EN_INSPECCION: "bg-sky-500",
  EXPEDIENTE_INCOMPLETO: "bg-amber-500",
  LISTO_PARA_VENTA: "bg-emerald-500",
  APARTADA: "bg-violet-500",
  VENDIDA_PEND_ENTREGA: "bg-blue-600",
  ENTREGADA: "bg-emerald-700",
  DEVUELTA_CONSIGNANTE: "bg-zinc-500",
  BAJA: "bg-red-500",
};

export const PUNTO_ESTADO_F06: Record<string, string> = {
  INCOMPLETO: "bg-amber-500",
  COMPLETO: "bg-sky-500",
  LISTO_PARA_VENTA: "bg-emerald-500",
};

// Camino feliz del ciclo de vida (stepper del detalle).
export const CAMINO_FELIZ = [
  "EN_RECEPCION",
  "EN_INSPECCION",
  "EXPEDIENTE_INCOMPLETO",
  "LISTO_PARA_VENTA",
  "APARTADA",
  "VENDIDA_PEND_ENTREGA",
  "ENTREGADA",
] as const;

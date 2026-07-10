// Mapa de dependencias del sistema documental M-01: qué es cada documento,
// cuál es su documento madre y qué destraba. Alimenta el grafo de /documentacion.

export type FichaDocumento = {
  codigo: string;
  nombre: string;
  categoria: "FORMATO" | "CONTRATO";
  etapa: string;
  descripcion: string;
};

export const FICHAS: FichaDocumento[] = [
  { codigo: "C-03", nombre: "Compraventa — el lote compra", categoria: "CONTRATO", etapa: "Adquisición", descripcion: "Contrato fuente de una unidad PROPIA: el lote adquiere el vehículo. Todo expediente propio nace de este contrato; es el documento madre del juego día 0." },
  { codigo: "C-04", nombre: "Consignación mercantil", categoria: "CONTRATO", etapa: "Adquisición", descripcion: "Contrato fuente de una unidad CONSIGNADA: el consignante entrega el vehículo para su venta. Documento madre del expediente consignado; habilita además la devolución al consignante." },
  { codigo: "F-01", nombre: "Ingreso / compra directa de unidad", categoria: "FORMATO", etapa: "Adquisición", descripcion: "Registro operativo del ingreso al lote cuando la compra es directa. Acompaña al C-03 según aplique." },
  { codigo: "F-02", nombre: "Acuerdo de consignación", categoria: "FORMATO", etapa: "Adquisición", descripcion: "Acuerdo operativo que detalla condiciones de la consignación. Acompaña al C-04 según aplique." },
  { codigo: "F-03", nombre: "Identificación de contraparte (KYC)", categoria: "FORMATO", etapa: "Adquisición", descripcion: "Identificación de quien vende o consigna. Parte del juego día 0: sin contraparte identificada no hay expediente sano." },
  { codigo: "F-04", nombre: "Recibo de compraventa", categoria: "FORMATO", etapa: "Adquisición", descripcion: "Recibo del pago de la compra directa. Según aplique, hijo del C-03." },
  { codigo: "F-05", nombre: "Checklist de inspección física", categoria: "FORMATO", etapa: "Inspección", descripcion: "Inspección física de la unidad al día 0. Firmado y ESCANEADO es lo que saca la unidad de inspección (→ Expediente incompleto)." },
  { codigo: "F-06", nombre: "Carátula y checklist maestro", categoria: "FORMATO", etapa: "Expediente", descripcion: "La carátula madre del expediente: lleva el checklist maestro y la casilla de estatus. Su casilla «Listo para venta» es la ÚNICA que autoriza emitir C-01 y C-02 (candado de venta)." },
  { codigo: "F-07", nombre: "Verificación de adeudos y situación", categoria: "FORMATO", etapa: "Expediente", descripcion: "Verificación de adeudos, multas y situación legal. Su escaneo es requisito para que la unidad pase a «Listo para venta»." },
  { codigo: "F-08", nombre: "Validación de factura y endosos", categoria: "FORMATO", etapa: "Expediente", descripcion: "Validación de la factura original y cadena de endosos. Su escaneo es requisito para «Listo para venta»." },
  { codigo: "F-09", nombre: "Control de trámites vehiculares", categoria: "FORMATO", etapa: "Trámites", descripcion: "Bitácora de trámites (tenencias, cambio de propietario, placas). Corre en paralelo; según aplique." },
  { codigo: "F-10", nombre: "Vale de resguardo de documentos y llaves", categoria: "FORMATO", etapa: "Trámites", descripcion: "Resguardo físico de documentos originales y llaves. Según aplique." },
  { codigo: "C-01", nombre: "Apartado de vehículo", categoria: "CONTRATO", etapa: "Venta", descripcion: "Contrato de apartado. Solo puede emitirse con F-06 en «Listo para venta»; escaneado permite marcar la unidad APARTADA." },
  { codigo: "C-02", nombre: "Compraventa — el lote vende", categoria: "CONTRATO", etapa: "Venta", descripcion: "Contrato de venta al cliente. Exige F-06 en «Listo para venta»; con escaneo + pago verificado la unidad pasa a VENDIDA y se habilita el F-11." },
  { codigo: "F-11", nombre: "Acta de entrega de unidad al cliente", categoria: "FORMATO", etapa: "Venta", descripcion: "Acta final de entrega. Solo se emite con C-02 escaneado y pago verificado; escaneada permite marcar ENTREGADA y cerrar el ciclo." },
];

export type Dependencia = {
  de: string;
  a: string;
  etiqueta: string;
};

// madre → dependiente, con la condición que los une
export const DEPENDENCIAS: Dependencia[] = [
  { de: "C-03", a: "F-01", etiqueta: "según aplique" },
  { de: "C-03", a: "F-04", etiqueta: "según aplique" },
  { de: "C-04", a: "F-02", etiqueta: "según aplique" },
  { de: "C-03", a: "F-03", etiqueta: "día 0" },
  { de: "C-04", a: "F-03", etiqueta: "día 0" },
  { de: "C-03", a: "F-05", etiqueta: "día 0" },
  { de: "C-04", a: "F-05", etiqueta: "día 0" },
  { de: "C-03", a: "F-06", etiqueta: "día 0" },
  { de: "C-04", a: "F-06", etiqueta: "día 0" },
  { de: "F-06", a: "F-07", etiqueta: "checklist maestro" },
  { de: "F-06", a: "F-08", etiqueta: "checklist maestro" },
  { de: "F-06", a: "F-09", etiqueta: "según aplique" },
  { de: "F-06", a: "F-10", etiqueta: "según aplique" },
  { de: "F-06", a: "C-01", etiqueta: "casilla «Listo» (candado de venta)" },
  { de: "F-06", a: "C-02", etiqueta: "casilla «Listo» (candado de venta)" },
  { de: "F-07", a: "C-02", etiqueta: "escaneado habilita LISTO" },
  { de: "F-08", a: "C-02", etiqueta: "escaneado habilita LISTO" },
  { de: "C-02", a: "F-11", etiqueta: "escaneado + pago verificado" },
];

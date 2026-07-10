// Juego documental esperado por etapa (M-01), según el origen de la unidad.
// Es la guía visual del expediente: el candado real vive en las funciones de BD.

export const NOMBRE_TIPO: Record<string, string> = {
  "F-01": "Ingreso / compra directa de unidad",
  "F-02": "Acuerdo de consignación",
  "F-03": "Identificación de contraparte (KYC)",
  "F-04": "Recibo de compraventa",
  "F-05": "Checklist de inspección física",
  "F-06": "Carátula y checklist maestro",
  "F-07": "Verificación de adeudos y situación",
  "F-08": "Validación de factura y endosos",
  "F-09": "Control de trámites vehiculares",
  "F-10": "Vale de resguardo de documentos y llaves",
  "F-11": "Acta de entrega de unidad al cliente",
  "C-01": "Apartado de vehículo",
  "C-02": "Compraventa — el lote vende",
  "C-03": "Compraventa — el lote compra",
  "C-04": "Consignación mercantil",
};

export type Exigencia = "dia0" | "requerido" | "segun_aplique";

export type RequisitoDocumento = {
  tipo: string;
  exigencia: Exigencia;
  /** Micro-copy: qué papel juega o qué destraba en el ciclo de vida. */
  proposito: string;
};

export type EtapaJuego = {
  codigo: string;
  etiqueta: string;
  requisitos: RequisitoDocumento[];
};

export function juegoEsperado(origen: "PROPIA" | "CONSIGNADA"): EtapaJuego[] {
  const esPropia = origen === "PROPIA";
  return [
    {
      codigo: "ADQUISICION",
      etiqueta: "Adquisición",
      requisitos: [
        esPropia
          ? { tipo: "C-03", exigencia: "dia0", proposito: "Contrato fuente: el lote compra la unidad" }
          : { tipo: "C-04", exigencia: "dia0", proposito: "Contrato fuente: consignación mercantil" },
        { tipo: "F-03", exigencia: "dia0", proposito: "KYC de la contraparte" },
        ...(esPropia
          ? [
              { tipo: "F-01", exigencia: "segun_aplique" as const, proposito: "Registro de ingreso por compra directa" },
              { tipo: "F-04", exigencia: "segun_aplique" as const, proposito: "Recibo de la compraventa" },
            ]
          : [{ tipo: "F-02", exigencia: "segun_aplique" as const, proposito: "Acuerdo operativo de la consignación" }]),
      ],
    },
    {
      codigo: "INSPECCION",
      etiqueta: "Inspección",
      requisitos: [
        {
          tipo: "F-05",
          exigencia: "dia0",
          proposito: "Firmado y escaneado saca la unidad de inspección",
        },
      ],
    },
    {
      codigo: "EXPEDIENTE",
      etiqueta: "Expediente",
      requisitos: [
        { tipo: "F-06", exigencia: "dia0", proposito: "Carátula; su casilla «Listo para venta» autoriza C-01/C-02" },
        { tipo: "F-07", exigencia: "requerido", proposito: "Escaneado habilita «Listo para venta»" },
        { tipo: "F-08", exigencia: "requerido", proposito: "Escaneado habilita «Listo para venta»" },
      ],
    },
    {
      codigo: "TRAMITES",
      etiqueta: "Trámites",
      requisitos: [
        { tipo: "F-09", exigencia: "segun_aplique", proposito: "Control de trámites vehiculares" },
        { tipo: "F-10", exigencia: "segun_aplique", proposito: "Resguardo de documentos y llaves" },
      ],
    },
    {
      codigo: "VENTA",
      etiqueta: "Venta",
      requisitos: [
        { tipo: "C-01", exigencia: "segun_aplique", proposito: "Apartado; escaneado permite marcar APARTADA" },
        { tipo: "C-02", exigencia: "requerido", proposito: "Con escaneo y pago verificado habilita F-11 y la venta" },
        { tipo: "F-11", exigencia: "requerido", proposito: "Acta de entrega; escaneada permite ENTREGADA" },
      ],
    },
  ];
}

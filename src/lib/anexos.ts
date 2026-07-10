// Catálogo de anexos del expediente: los documentos externos que el
// checklist maestro (F-06) pide resguardar escaneados. La exigencia depende
// del origen de la unidad; `sensible` activa la marca de agua
// «PARA CONSULTA INTERNA · SIN VALIDEZ» al consultarlos.

export type ExigenciaAnexo = "OBLIGATORIO" | "OPCIONAL" | "SEGUN_APLIQUE";

export type FichaAnexo = {
  clave: string;
  nombre: string;
  descripcion: string;
  sensible: boolean;
  exigencia: Record<"PROPIA" | "CONSIGNADA", ExigenciaAnexo | null>; // null = no aplica
};

export const ANEXOS: FichaAnexo[] = [
  {
    clave: "factura_original",
    nombre: "Factura original (última)",
    descripcion: "Con sellos y firmas; la que acredita la propiedad de la unidad.",
    sensible: true,
    exigencia: { PROPIA: "OBLIGATORIO", CONSIGNADA: "SEGUN_APLIQUE" },
  },
  {
    clave: "facturas_consecutivas",
    nombre: "Facturas consecutivas / endosos",
    descripcion: "Secuencia completa de facturas anteriores y cadena de endosos.",
    sensible: true,
    exigencia: { PROPIA: "SEGUN_APLIQUE", CONSIGNADA: "SEGUN_APLIQUE" },
  },
  {
    clave: "ine_partes",
    nombre: "Identificación de las partes",
    descripcion: "INE / pasaporte de quien vende o consigna (cotejada con F-03).",
    sensible: true,
    exigencia: { PROPIA: "OBLIGATORIO", CONSIGNADA: "OBLIGATORIO" },
  },
  {
    clave: "comprobante_pago",
    nombre: "Comprobantes de pago",
    descripcion: "Transferencias o recibos que respaldan la operación de compra.",
    sensible: true,
    exigencia: { PROPIA: "OBLIGATORIO", CONSIGNADA: "SEGUN_APLIQUE" },
  },
  {
    clave: "tarjeta_circulacion",
    nombre: "Tarjeta de circulación",
    descripcion: "Vigente o última disponible de la unidad.",
    sensible: true,
    exigencia: { PROPIA: "SEGUN_APLIQUE", CONSIGNADA: "SEGUN_APLIQUE" },
  },
  {
    clave: "baja_placas",
    nombre: "Comprobante de baja de placas",
    descripcion: "Baja local o foránea, según el trámite realizado (ref. F-09).",
    sensible: false,
    exigencia: { PROPIA: "SEGUN_APLIQUE", CONSIGNADA: "SEGUN_APLIQUE" },
  },
  {
    clave: "constancia_repuve",
    nombre: "Constancia REPUVE",
    descripcion: "Consulta del registro público vehicular, si se cuenta con ella.",
    sensible: false,
    exigencia: { PROPIA: "OPCIONAL", CONSIGNADA: "OPCIONAL" },
  },
  {
    clave: "verificacion_vigente",
    nombre: "Verificación vehicular vigente",
    descripcion: "Último comprobante de verificación, si aplica en la entidad.",
    sensible: false,
    exigencia: { PROPIA: "OPCIONAL", CONSIGNADA: "OPCIONAL" },
  },
  {
    clave: "poliza_seguro",
    nombre: "Póliza de seguro del consignante",
    descripcion: "Seguro vigente durante la consignación (ref. C-04).",
    sensible: true,
    exigencia: { PROPIA: null, CONSIGNADA: "OPCIONAL" },
  },
];

export const fichaAnexo = (clave: string) => ANEXOS.find((a) => a.clave === clave);

/** Anexos que aplican a un origen, en orden de catálogo. */
export function anexosDeOrigen(origen: "PROPIA" | "CONSIGNADA"): FichaAnexo[] {
  return ANEXOS.filter((a) => a.exigencia[origen] !== null);
}

export const ETIQUETA_EXIGENCIA: Record<ExigenciaAnexo, string> = {
  OBLIGATORIO: "Obligatorio",
  OPCIONAL: "Opcional",
  SEGUN_APLIQUE: "Según aplique",
};

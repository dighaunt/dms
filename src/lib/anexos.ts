// Catálogo de anexos del expediente: los documentos externos que el
// checklist maestro (F-06) pide resguardar escaneados. La exigencia depende
// del origen de la unidad; `sensible` activa la marca de agua
// «PARA CONSULTA INTERNA · SIN VALIDEZ» al consultarlos.

export type ExigenciaAnexo = "OBLIGATORIO" | "OPCIONAL" | "SEGUN_APLIQUE";

export type CustodiaAnexo = {
  /** Qué pasa con el ORIGINAL: quién se lo queda y hasta cuándo. */
  original: string;
  /** Qué pasa con la COPIA. null = no aplica copia para este documento. */
  copia: string | null;
};

export type FichaAnexo = {
  clave: string;
  nombre: string;
  descripcion: string;
  sensible: boolean;
  exigencia: Record<"PROPIA" | "CONSIGNADA", ExigenciaAnexo | null>; // null = no aplica
  /** Instrucción de custodia según M-01 (Copias, cotejo y retención). Sin
   * este campo si el manual no lo especifica — no se inventa la regla. */
  custodia?: CustodiaAnexo;
};

export const ANEXOS: FichaAnexo[] = [
  {
    clave: "factura_original",
    nombre: "Factura original (última)",
    descripcion: "Con sellos y firmas; la que acredita la propiedad de la unidad.",
    sensible: true,
    exigencia: { PROPIA: "OBLIGATORIO", CONSIGNADA: "SEGUN_APLIQUE" },
    custodia: {
      original: "Se queda en el lote (resguardo F-10) mientras la unidad esté en inventario; pasa al comprador (endosada) al venderse.",
      copia: "Cotejada, siempre al expediente — aunque el original salga.",
    },
  },
  {
    clave: "facturas_consecutivas",
    nombre: "Facturas consecutivas / endosos",
    descripcion: "Secuencia completa de facturas anteriores y cadena de endosos.",
    sensible: true,
    exigencia: { PROPIA: "SEGUN_APLIQUE", CONSIGNADA: "SEGUN_APLIQUE" },
    custodia: {
      original: "Igual que la factura original: en el lote (F-10) mientras esté en inventario, al comprador al venderse.",
      copia: "Cotejada, siempre al expediente.",
    },
  },
  {
    clave: "ine_partes",
    nombre: "Identificación de las partes",
    descripcion: "INE / pasaporte de quien vende o consigna (cotejada con F-03).",
    sensible: true,
    exigencia: { PROPIA: "OBLIGATORIO", CONSIGNADA: "OBLIGATORIO" },
    custodia: {
      original: "SE DEVUELVE EN EL ACTO. Nunca se retiene una identificación original — retenerla es ilegal.",
      copia: "Cotejada (ambos lados, en una sola hoja) al expediente, con sello de cotejo.",
    },
  },
  {
    clave: "comprobante_pago",
    nombre: "Comprobantes de pago",
    descripcion: "Transferencias o recibos que respaldan la operación de compra.",
    sensible: true,
    exigencia: { PROPIA: "OBLIGATORIO", CONSIGNADA: "SEGUN_APLIQUE" },
    custodia: {
      original: "Es electrónico (SPEI/transferencia): se imprime para el expediente, no hay papel físico que devolver.",
      copia: "Al tanto de la contraparte, si lo pide.",
    },
  },
  {
    clave: "tarjeta_circulacion",
    nombre: "Tarjeta de circulación",
    descripcion: "Vigente o última disponible de la unidad.",
    sensible: true,
    exigencia: { PROPIA: "SEGUN_APLIQUE", CONSIGNADA: "SEGUN_APLIQUE" },
    custodia: {
      original: "Al lote durante el inventario (resguardo F-10); al comprador en la entrega, si sigue vigente.",
      copia: "Al expediente.",
    },
  },
  {
    clave: "baja_placas",
    nombre: "Comprobante de baja de placas",
    descripcion: "Baja local o foránea, según el trámite realizado (ref. F-09).",
    sensible: false,
    exigencia: { PROPIA: "SEGUN_APLIQUE", CONSIGNADA: "SEGUN_APLIQUE" },
    custodia: {
      original: "Al expediente; si le corresponde al comprador (p. ej. para reemplacar), se le entrega en el acta de entrega (F-11) y se asienta.",
      copia: "Al expediente, si el original se entrega al comprador.",
    },
  },
  {
    clave: "constancia_repuve",
    nombre: "Constancia REPUVE",
    descripcion: "Consulta del registro público vehicular, si se cuenta con ella.",
    sensible: false,
    exigencia: { PROPIA: "OPCIONAL", CONSIGNADA: "OPCIONAL" },
    custodia: {
      original: "La impresión o captura con fecha ES la evidencia; va al expediente junto al F-07.",
      copia: null,
    },
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

/** Comunica el anexo elegido desde una etapa con su entrada en el checklist. */
export const EVENTO_ENFOCAR_ANEXO = "dms:enfocar-anexo";

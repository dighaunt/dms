// Guía previa a la captura. Resume el M-01 Rev. 3.0 para que el equipo sepa
// qué reunir y qué destino tendrá cada documento antes de abrir un formato.

export type GuiaOperativa = {
  etapa: string;
  solicita: string[];
  cierra: string[];
  alerta?: string;
};

const GUIAS: Record<string, GuiaOperativa> = {
  "C-01": {
    etapa: "Venta · apartado",
    solicita: [
      "INE vigente del interesado (o pasaporte/cédula vigente), a la vista; toma copia de ambos lados para el F-03.",
      "Comprobante del monto de apartado y los datos que el interesado confirma en persona.",
      "Confirma que el F-06 ya está en LISTO PARA VENTA antes de comprometer la unidad.",
    ],
    cierra: [
      "Imprime dos originales idénticos: uno para el interesado y uno para el expediente.",
      "Coteja y resguarda la copia de identificación; devuelve el original de INE/pasaporte en el acto.",
      "Integra el comprobante de apartado y coloca banda amarilla a la carpeta mientras el C-01 siga vigente.",
    ],
  },
  "C-02": {
    etapa: "Venta · compraventa",
    solicita: [
      "INE vigente del comprador (o identificación aceptada) y, cuando aplique, RFC/datos fiscales; la persona decide radios de garantía y datos personales.",
      "Comprobante de pago y los datos del documento de propiedad que se entregará según el escenario de facturación.",
      "Confirma que el F-06 está LISTO PARA VENTA; para efectivo en umbral PLD o señales inusuales, detén y escala a N3.",
    ],
    cierra: [
      "Imprime dos originales idénticos: comprador y expediente; escanea el tanto del lote el mismo día.",
      "Devuelve la identificación original y conserva copia cotejada en el expediente.",
      "La factura/endoso o CFDI original es para el comprador; al expediente queda copia certificada. No entregues llaves sin pago verificado y F-11.",
    ],
  },
  "C-03": {
    etapa: "Adquisición · compra de unidad",
    solicita: [
      "INE vigente del vendedor (o pasaporte/cédula vigente), CURP, y comprobante de domicilio de máximo 3 meses; si aplica, RFC.",
      "Factura de origen y cadena completa de endosos, tarjeta de circulación, vehículo y llaves para cotejo físico de VIN, más evidencia para F-07 y F-08.",
      "Datos reales del vendedor y precio pactado después de F-05; ningún dato se llena de memoria ni desde una foto de WhatsApp.",
    ],
    cierra: [
      "Imprime dos originales idénticos: vendedor y expediente. El vendedor recibe además su tanto del F-04 (recibo).",
      "La INE original se devuelve en el acto; al expediente entra copia cotejada de ambos lados con fecha, nombre y firma de quien coteja.",
      "No liberes pago hasta que F-07 y F-08 estén terminados y anexados. Originales de propiedad y llaves se resguardan con F-10.",
    ],
    alerta: "REPUVE con reporte, cadena de facturas incompleta, identificación alterada o presión por pago inmediato: no compres ni confrontes; documenta y escala.",
  },
  "C-04": {
    etapa: "Adquisición · consignación",
    solicita: [
      "INE vigente del consignante y copia cotejada; solicita factura y endosos, tarjeta de circulación, unidad, llaves y accesorios para el F-10.",
      "Póliza de seguro si la opción pactada la exige, y los datos para F-03, F-05 y F-07.",
      "Define con el consignante, antes de firmar, la opción de seguro y el precio mínimo autorizado.",
    ],
    cierra: [
      "Imprime dos originales de C-04: consignante y expediente. F-10 también se firma en dos tantos.",
      "El consignante se lleva su tanto de F-10 como recibo de los originales y llaves entregados; el lote resguarda los suyos.",
      "Devuelve su identificación original y archiva solamente la copia cotejada.",
    ],
    alerta: "No uses la unidad ni saques originales del resguardo. Si hay adeudos, recibe solo con un plan escrito de liquidación o descuento.",
  },
  "F-01": {
    etapa: "Adquisición · alta de inventario",
    solicita: [
      "Unidad presente para verificar VIN, marca, modelo, año, color, kilometraje, placas y número de motor.",
      "Los datos ya confirmados con vendedor, contrato fuente y evidencia de ingreso.",
    ],
    cierra: [
      "Conserva este formato en un tanto dentro del expediente y refleja los mismos datos en el F-06/DMS.",
      "Verifica VIN del formato contra parabrisas, marco de puerta y factura antes de firmar.",
    ],
  },
  "F-02": {
    etapa: "Adquisición · acuerdo de consignación",
    solicita: [
      "Datos operativos del consignante, unidad, precio mínimo, vigencia y condiciones que ya fueron acordadas en C-04.",
      "Llaves, documentos y accesorios que entrarán a resguardo para relacionarlos con F-10.",
    ],
    cierra: [
      "Resguarda un tanto en el expediente y alinea los datos con C-04; no cambies el precio mínimo sin autorización escrita.",
      "Escanea el juego firmado el mismo día y conserva los originales bajo F-10.",
    ],
  },
  "F-03": {
    etapa: "KYC · identificación de contraparte",
    solicita: [
      "Persona física mexicana: INE vigente; alternativa: pasaporte mexicano o cédula profesional vigente. Pide CURP, RFC si aplica y comprobante de domicilio ≤ 3 meses.",
      "Persona extranjera: pasaporte vigente y residencia temporal/permanente. Persona moral: acta, poder, INE del representante, constancia fiscal y beneficiario controlador.",
      "Quien firma por otro: poder para el acto específico, INE del apoderado e identificación del poderdante.",
    ],
    cierra: [
      "Captura con la contraparte presente y el original a la vista; marca las verificaciones de cotejo que exige el formato.",
      "Devuelve siempre el original de identificación. Conserva copia de ambos lados cotejada con fecha, nombre y firma.",
      "Escanea e integra la copia el mismo día; no aceptes una copia previa sin ver su original.",
    ],
    alerta: "Si hay nombres que no coinciden, identificación alterada, negativa de KYC o extranjero que transmite propiedad solo con FMM: detén y escala.",
  },
  "F-04": {
    etapa: "Adquisición · recibo de pago",
    solicita: [
      "Importe, fecha, medio de pago y comprobante SPEI/cheque o recibo que corresponda a la compra.",
      "Confirmación de identidad del vendedor y que C-03, F-07 y F-08 ya permiten el pago.",
    ],
    cierra: [
      "El vendedor recibe su tanto del recibo; conserva el tanto del expediente junto con el comprobante de pago.",
      "El comprobante digital se imprime o integra al expediente; entrega copia a la contraparte cuando la solicite.",
    ],
  },
  "F-05": {
    etapa: "Inspección física",
    solicita: [
      "La unidad, llaves y acceso a VIN, motor, odómetro, carrocería y accesorios para inspección física y fotografías.",
      "Presencia de quien corresponda para reconocer el estado de ingreso; documenta daños, desgaste y kilometraje real.",
    ],
    cierra: [
      "Este formato vive en un tanto en el expediente; obtén firmas requeridas y escanéalo el mismo día.",
      "Coteja VIN contra unidad y factura. Si el desgaste no coincide con kilometraje, registra evidencia y ajusta o escala antes de comprar.",
    ],
  },
  "F-06": {
    etapa: "Expediente · checklist maestro",
    solicita: [
      "Todos los documentos que entraron al expediente, para marcar Sí/No y Original/Copia el día real de ingreso.",
      "Nombre de custodio y ubicación física exacta de los originales; no uses ubicaciones genéricas.",
    ],
    cierra: [
      "Registra pendientes tal como existen: no marques LISTO PARA VENTA hasta tener checklist completo y F-07/F-08 limpios.",
      "Todo original que salga del resguardo se asienta en F-10 con motivo y devolución.",
    ],
  },
  "F-07": {
    etapa: "Expediente · adeudos y situación",
    solicita: [
      "Datos de placas/VIN y acceso a las consultas de adeudos, multas y REPUVE; conserva la evidencia con fecha.",
      "Comprobante de liquidación si existe un adeudo o autorización escrita de descuento del vendedor/consignante.",
    ],
    cierra: [
      "Integra impresiones o capturas fechadas al expediente y escanéalas junto al formato.",
      "No declares LISTO PARA VENTA ni liberes pago de compra con adeudos sin solución escrita.",
    ],
  },
  "F-08": {
    etapa: "Expediente · factura y endosos",
    solicita: [
      "Factura de origen y cada factura/endoso consecutivo hasta la persona que transmite la unidad; revisa nombres, VIN y continuidad.",
      "Documento puente si hay cambio de nombre, corrección o representación; sin él, no adivines ni completes la cadena.",
    ],
    cierra: [
      "Copia cotejada al expediente y originales bajo resguardo F-10 mientras la unidad siga en inventario.",
      "Cadena incompleta o inconsistente: no se firma la compra ni se publica la unidad; escala el caso.",
    ],
  },
  "F-09": {
    etapa: "Trámites",
    solicita: [
      "El documento origen, requisitos vigentes de la autoridad y evidencia de la consulta con fuente y fecha.",
      "Fecha compromiso, responsable y comprobantes de pago/ingreso para cada trámite abierto.",
    ],
    cierra: [
      "Integra el comprobante de cada avance al expediente; si el original se entrega al comprador, conserva copia y asíentalo en F-11.",
      "Comunica fechas solo con el F-09 a la vista; no inventes compromisos mientras el trámite esté pendiente.",
    ],
  },
  "F-10": {
    etapa: "Trámites · resguardo",
    solicita: [
      "Factura(s), cadena de endosos, tarjeta de circulación, llaves, duplicados, manuales y accesorios que físicamente entran o salen.",
      "Identidad de quien entrega/recibe y ubicación de custodia de cada original.",
    ],
    cierra: [
      "Relaciona cada objeto, firma el vale y guarda el original bajo custodia. En consignación, entrega al consignante su tanto firmado.",
      "Nada sale «un momento»: cada salida lleva motivo, responsable y devolución registrada.",
    ],
  },
  "F-11": {
    etapa: "Venta · entrega y cierre",
    solicita: [
      "C-02 firmado, pago verificado, kit de entrega revisado, documento de propiedad correcto, llaves, accesorios, combustible y kilometraje reales.",
      "Confirmación del comprador sobre cada documento y objeto que recibe; anota pendientes autorizados con fecha por escrito.",
    ],
    cierra: [
      "Firma dos originales: comprador y expediente. El comprador recibe su tanto dentro del kit junto con propiedad, C-02 y copias pertinentes.",
      "Escanea el tanto del expediente y archívalo con los vendidos. No sueltes llaves ni entregues unidad sin F-11 firmado.",
    ],
  },
};

const GUIA_GENERAL: GuiaOperativa = {
  etapa: "Captura documental",
  solicita: [
    "Contraparte presente, identificación original a la vista y documentos soporte de la operación.",
    "Datos reales de la unidad y expediente; nunca captures desde memoria o una foto no cotejada.",
  ],
  cierra: [
    "Completa o anula todo campo antes de firmar; segunda persona confronta VIN, importes y los tantos.",
    "Coteja copias, devuelve identificaciones originales y escanea el tanto del expediente el mismo día.",
  ],
};

export function guiaOperativaPara(tipo: string): GuiaOperativa {
  return GUIAS[tipo] ?? GUIA_GENERAL;
}

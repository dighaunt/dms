import type { Root } from "fumadocs-core/page-tree";

export type ManualFuente = {
  documento: string;
  referencia: string;
};

export type ManualTabla = {
  titulo?: string;
  encabezados: string[];
  filas: string[][];
};

export type ManualSeccion = {
  id: string;
  titulo: string;
  parrafos: string[];
  puntos?: string[];
  pasos?: string[];
  tablas?: ManualTabla[];
};

export type ManualArticulo = {
  slug: string;
  manual: "M-01" | "M-02" | "M-01A";
  parte: string;
  titulo: string;
  descripcion: string;
  fuentes: ManualFuente[];
  secciones: ManualSeccion[];
  aviso?: {
    tipo: "info" | "warning" | "success";
    titulo: string;
    texto: string;
  };
};

export const MANUALES: ManualArticulo[] = [
  {
    slug: "m01-organizacion-y-gobierno",
    manual: "M-01",
    parte: "Parte I",
    titulo: "Organización, roles y gobierno",
    descripcion:
      "La referencia para saber quién ejecuta, quién verifica y cuándo debe escalarse una decisión documental.",
    fuentes: [{ documento: "M-01 Rev. 3.0", referencia: "pp. 3-5" }],
    secciones: [
      {
        id: "proposito",
        titulo: "Propósito del libro",
        parrafos: [
          "M-01 organiza la operación documental de la unidad desde su ingreso hasta la entrega. La captura debe conservar la evidencia que sustenta cada estado y cada movimiento de dinero.",
          "Los documentos firmados, sus anexos cotejados y el expediente son la fuente de verdad. La interfaz sirve para registrar y consultar el proceso, no para reemplazar el documento fuente.",
        ],
      },
      {
        id: "roles",
        titulo: "Roles y responsabilidades",
        parrafos: [
          "El manual asigna responsabilidades diferenciadas para operación, control documental, autorización y dirección. Antes de cerrar un paso, el responsable confirma que cuenta con los soportes y firmas exigidos.",
        ],
        puntos: [
          "Quien captura registra hechos verificables y adjunta la evidencia correspondiente.",
          "Quien revisa contrasta unidad, identidad, importes y documentos contra los originales o comprobantes.",
          "Las excepciones, diferencias documentales, alertas PLD y decisiones fuera de la regla se escalan al nivel que corresponda.",
        ],
      },
      {
        id: "raci",
        titulo: "Matriz RACI",
        parrafos: [
          "La matriz RACI de M-01 evita que una sola persona capture, autorice y cierre una excepción sin control cruzado. Consulta la matriz antes de asignar un caso que tenga impacto contractual, de pago o de custodia.",
        ],
        puntos: [
          "Responsable: ejecuta la actividad y deja evidencia.",
          "Aprobador: asume la decisión cuando el proceso pide autorización.",
          "Consultado: aporta revisión técnica, documental o de cumplimiento.",
          "Informado: recibe trazabilidad del avance o cierre.",
        ],
      },
    ],
  },
  {
    slug: "m01-manual-operativo",
    manual: "M-01",
    parte: "Parte II",
    titulo: "Manual operativo",
    descripcion:
      "Reglas de captura, cotejo, expediente, trazabilidad comercial y controles que aplican antes de emitir un contrato o entregar una unidad.",
    fuentes: [{ documento: "M-01 Rev. 3.0", referencia: "pp. 6-28" }],
    aviso: {
      tipo: "warning",
      titulo: "Regla de captura",
      texto:
        "No completes campos por memoria, mensajes, ni supuestos. Si falta el soporte, registra el pendiente y escala; no conviertas una duda en un dato definitivo.",
    },
    secciones: [
      {
        id: "alcance",
        titulo: "Alcance y principios",
        parrafos: [
          "Esta parte describe el ciclo documental de compra directa, consignación y venta, y establece controles para que las decisiones tengan evidencia verificable.",
        ],
        puntos: [
          "Lo hablado no sustituye el documento firmado.",
          "El dato se captura desde la fuente que lo acredita y se conserva con su expediente.",
          "Un pendiente se mantiene visible hasta que exista evidencia de cierre.",
        ],
      },
      {
        id: "flujo",
        titulo: "Flujo de punta a punta",
        parrafos: [
          "El ciclo pasa por ingreso de la unidad, identificación de contraparte, inspección, integración del expediente, trámites aplicables, venta y entrega. Cada etapa tiene documentos que habilitan la siguiente.",
        ],
        puntos: [
          "No se ofrece ni se aparta una unidad sin F-06 en Listo para venta.",
          "C-02 requiere expediente listo, pago verificado y sus soportes antes de habilitar F-11.",
          "La entrega solo se cierra con el acta correspondiente y evidencia escaneada en expediente.",
        ],
      },
      {
        id: "captura-y-cotejo",
        titulo: "Captura, cotejo y tantos",
        parrafos: [
          "El operador identifica a la contraparte con los originales a la vista, coteja datos de unidad y documentos de propiedad, y conserva las copias que el formato exige. Los originales de identificación se devuelven en el acto.",
          "Cuando un contrato o formato exige dos tantos, uno se entrega a la contraparte y el otro se integra al expediente. El tanto del expediente se escanea el mismo día cuando el flujo lo exige.",
        ],
        puntos: [
          "Verifica VIN, identidad, fecha e importes antes de firmar.",
          "No adivines una cadena de endosos ni completes nombres que no coinciden.",
          "Registra correcciones con trazabilidad; no ocultes un error mediante sobreescritura silenciosa.",
        ],
      },
      {
        id: "documentos-y-resguardo",
        titulo: "Factura, endosos, trámites y resguardo",
        parrafos: [
          "La factura de origen y la cadena de endosos se validan contra la unidad y la contraparte. Los originales y llaves se controlan con F-10 mientras la unidad permanece en inventario.",
          "Los trámites vehiculares se registran con responsable, evidencia y fecha real. La comunicación al cliente se basa en el F-09 y no en una fecha estimada no respaldada.",
        ],
      },
      {
        id: "pld-y-garantia",
        titulo: "PLD, garantía y comunicación",
        parrafos: [
          "M-01 concentra los controles PLD, las condiciones de garantía, los guiones de comunicación y las reglas de entrega. Las alertas no se resuelven modificando datos ni prometiendo una salida al cliente.",
        ],
        puntos: [
          "Ante efectivo en umbral, inconsistencia de identidad, REPUVE o presión por pago, detente y escala.",
          "Los días y kilómetros de garantía deben provenir de la política y contrato aplicable, no de un acuerdo verbal.",
          "El kit de cliente se entrega contra los documentos y objetos realmente verificados.",
        ],
      },
      {
        id: "dms-y-seguimiento",
        titulo: "DMS, ciclo de vida y seguimiento",
        parrafos: [
          "El expediente maestro DMS refleja el estado documental de la unidad, su trazabilidad comercial y los cuellos de botella. No cambies un estado para desbloquear una pantalla: primero resuelve el requisito documental que lo habilita.",
        ],
      },
    ],
  },
  {
    slug: "m01-documentos-y-formatos",
    manual: "M-01",
    parte: "Parte III",
    titulo: "Documentos, contratos y candados",
    descripcion:
      "Índice operativo de formatos F-01 a F-11 y contratos C-01 a C-04, con el documento madre y el punto del ciclo que habilitan.",
    fuentes: [{ documento: "M-01 Rev. 3.0", referencia: "pp. 29-36" }],
    secciones: [
      {
        id: "formatos",
        titulo: "Formatos operativos",
        parrafos: [
          "Los formatos sostienen el expediente desde la adquisición hasta la entrega. Se usan junto con el contrato que origine la operación y se conservan con sus soportes.",
        ],
        puntos: [
          "F-01 ingreso o compra directa; F-02 acuerdo de consignación; F-03 identificación de contraparte; F-04 recibo de compraventa.",
          "F-05 inspección física; F-06 carátula y checklist maestro; F-07 verificación de adeudos y situación; F-08 validación de factura y endosos.",
          "F-09 control de trámites; F-10 vale de resguardo de documentos y llaves; F-11 acta de entrega de unidad.",
        ],
      },
      {
        id: "contratos",
        titulo: "Contratos fuente",
        parrafos: [
          "C-03 es la compraventa cuando el lote adquiere una unidad y C-04 es la consignación mercantil. Ambos originan el expediente de adquisición. C-01 aparta una unidad para venta y C-02 formaliza su venta al comprador.",
        ],
        puntos: [
          "C-01 y C-02 solo se emiten cuando F-06 confirma Listo para venta.",
          "C-02, con pago verificado y el tanto escaneado, habilita el acta F-11.",
          "F-11 firmado y escaneado cierra la entrega de la unidad.",
        ],
      },
      {
        id: "validacion",
        titulo: "Validación antes de operar",
        parrafos: [
          "M-01 exige validar los formatos y contratos antes de operar cambios formales. Un archivo disponible para descarga no significa que una cláusula, formato nuevo o modificación contractual esté autorizado para uso productivo.",
        ],
      },
    ],
  },
  {
    slug: "m01-calculos-y-tablas",
    manual: "M-01",
    parte: "Parte IV",
    titulo: "Fórmulas, tabuladores y escalamiento",
    descripcion:
      "Reglas matemáticas de apartado, venta, compra, consignación, PLD y garantía. El motor calcula desde los datos fuente; el capturista no sustituye el resultado.",
    fuentes: [{ documento: "M-01 Rev. 3.0", referencia: "pp. 37-40" }],
    aviso: {
      tipo: "info",
      titulo: "Orden de datos para C-01",
      texto:
        "Captura primero monto del apartado (A) y precio total pactado (OP). DMS aplica la política contractual vigente de 50% y calcula P = min((p / 100) x A, OP), seguida de R = A - P.",
    },
    secciones: [
      {
        id: "apartado",
        titulo: "Apartado y pena espejo",
        parrafos: [
          "M-01 publica la fórmula de pena de apartado P = min((p / 100) x A, OP) y el remanente R = A - P. La configuración productiva de DMS aplica p = 50 por política contractual, sin campo editable para sustituirla.",
          "Para el desistimiento atribuible al proveedor, M-01 contempla la pena espejo D = A + ((p / 100) x A). La aplicación de una exención o de un caso fuera de la regla requiere el proceso y autorización correspondientes.",
        ],
      },
      {
        id: "otras-formulas",
        titulo: "Venta, compra y consignación",
        parrafos: [
          "Las fórmulas publicadas en M-01 incluyen C-02: P = min(0.15 x P_contado, OP); C-03: P = min(0.10 x P_total, OP); y consignación: L = Pv - Rt - G.",
          "Para consignación se documentan también Rt como porcentaje o importe fijo, Mret = 0.03 x Vm x d / 30 y Alm = 0.02 x Vm x d / 30. Usa las variables del contrato y el tabulador fuente; no cambies la base para forzar un resultado.",
        ],
      },
      {
        id: "pld-y-garantia",
        titulo: "PLD y garantía",
        parrafos: [
          "La tabla de M-01 usa UMA 2026 de $117.31 y muestra los umbrales Uid = 3,210 UMA y Uav = 6,420 UMA. Los montos que se acerquen a los umbrales requieren el control y evidencia indicados por el manual.",
          "La garantía se comprueba contra el plazo y kilometraje pactados: t no puede exceder tmax y km no puede exceder kmmax. La captura debe usar valores documentados en el contrato, no estimaciones.",
        ],
      },
      {
        id: "tabulador-y-escalamiento",
        titulo: "Tabulador y escalamiento",
        parrafos: [
          "El tabulador calcula; no decide si una pena procede ni reemplaza la autorización. Ante datos incompletos, causa no contemplada, diferencia en el contrato o resultado que parezca inusual, conserva la evidencia y escala antes de registrar el cierre.",
        ],
      },
    ],
  },
  {
    slug: "m02-alcance-y-uso",
    manual: "M-02",
    parte: "Parte I",
    titulo: "Alcance y uso del anexo",
    descripcion:
      "Cómo leer M-02 junto con M-01 para documentar penalizaciones, desistimientos y cancelaciones sin alterar las fórmulas fuente.",
    fuentes: [{ documento: "M-02 v1.0", referencia: "Parte I" }],
    aviso: {
      tipo: "warning",
      titulo: "M-02 es complementario",
      texto:
        "M-02 no sustituye ni modifica las fórmulas, tabuladores o glosario de M-01. Para cálculos, la fuente sigue siendo M-01 Parte IV y la política contractual vigente en DMS.",
    },
    secciones: [
      {
        id: "que-aporta",
        titulo: "Qué aporta el anexo",
        parrafos: [
          "El anexo reúne el fundamento normativo, autorizaciones, documentación trazable y casos borde que M-01 distribuye entre contratos y procesos. Se consulta en conjunto con el contrato concreto y con los documentos del expediente.",
        ],
        puntos: [
          "Identifica la norma y artículo citado por el anexo.",
          "Distingue la regla legal de una política interna del lote.",
          "Relaciona la decisión con el contrato, formato y fórmula de M-01 que la ejecutan.",
        ],
      },
      {
        id: "alcance-operativo",
        titulo: "Alcance operativo",
        parrafos: [
          "Aplica a cancelación, desistimiento o terminación anticipada de C-01, C-02, C-03 y C-04. El operador clasifica el caso con evidencia; no usa una causa para evitar una penalización ni impone una pena cuando la causa documentada la excluye.",
        ],
      },
    ],
  },
  {
    slug: "m02-marco-legal",
    manual: "M-02",
    parte: "Parte II",
    titulo: "Marco legal y fuentes",
    descripcion:
      "Fuentes que M-02 cita para contextualizar penas convencionales, protección al consumidor, consignación y devoluciones.",
    fuentes: [{ documento: "M-02 v1.0", referencia: "Parte II" }],
    aviso: {
      tipo: "warning",
      titulo: "Referencia documental, no dictamen",
      texto:
        "La vigencia y aplicación jurídica deben validarse antes de modificar contratos, crear formatos o resolver una excepción. Esta pantalla no sustituye la revisión legal externa indicada por M-02.",
    },
    secciones: [
      {
        id: "fuentes",
        titulo: "Fuentes citadas por M-02",
        parrafos: [
          "M-02 ordena la consulta desde la NOM-122-SCFI-2010, la Ley Federal de Protección al Consumidor, el Código de Comercio y el Código Civil Federal como derecho supletorio que el anexo describe.",
        ],
        puntos: [
          "NOM-122-SCFI-2010: prácticas comerciales de vehículos usados y consignación.",
          "LFPC: protección al consumidor y límites de cláusulas contractuales.",
          "Código de Comercio: terminación y liquidación en consignación.",
          "Código Civil Federal: teoría general de la cláusula penal, según el anexo.",
        ],
      },
      {
        id: "apartado-no-arras",
        titulo: "Apartado y referencia a arras",
        parrafos: [
          "M-02 advierte que el C-01 no debe explicarse como arras civiles. El anexo lo trata como un contrato de adhesión regulado por la NOM-122 y la cláusula penal aplicable, con la documentación y fórmula de M-01.",
        ],
      },
      {
        id: "devoluciones",
        titulo: "Devoluciones y trazabilidad",
        parrafos: [
          "El anexo indica que una devolución conserva controles de trazabilidad y PLD. El medio de devolución, los montos acumulados y la evidencia deben revisarse con el expediente y las reglas vigentes antes de pagar.",
        ],
      },
    ],
  },
  {
    slug: "m02-apartado-y-anticipo",
    manual: "M-02",
    parte: "Parte III",
    titulo: "Apartado frente a anticipo",
    descripcion:
      "Criterio de clasificación para no aplicar la fórmula o cláusula equivocada cuando el cliente ya firmó una venta.",
    fuentes: [{ documento: "M-02 v1.0", referencia: "Parte III" }],
    secciones: [
      {
        id: "criterio",
        titulo: "El documento firmado define la operación",
        parrafos: [
          "M-02 fija que la caracterización no depende de lo que alguien recuerde haber dicho. Si solo existe C-01, el monto se trata como apartado. Si ya existe C-02, cualquier entrega es parte del precio pactado en ese contrato y sigue sus propias cláusulas.",
        ],
      },
      {
        id: "captura",
        titulo: "Regla para captura y cierre",
        parrafos: [
          "Antes de calcular o registrar una cancelación, confirma qué contrato se firmó y adjunta el comprobante de pago que acredita el monto efectivamente entregado. Una etiqueta incorrecta altera la fórmula, autorización y devolución aplicables.",
        ],
      },
    ],
  },
  {
    slug: "m02-pena-convencional",
    manual: "M-02",
    parte: "Parte IV",
    titulo: "Pena convencional: límites y validez",
    descripcion:
      "Controles previos para que una cláusula o su aplicación no contradigan los límites que M-02 identifica.",
    fuentes: [{ documento: "M-02 v1.0", referencia: "Parte IV" }],
    secciones: [
      {
        id: "limites",
        titulo: "Límites de la cláusula",
        parrafos: [
          "M-02 remite a los supuestos del artículo 90 de la LFPC y exige revisar que la cláusula no permita modificaciones unilaterales, liberación indebida del proveedor, traslado de responsabilidad, formalidades improcedentes o renuncias a protección aplicable.",
        ],
      },
      {
        id: "formula-fuente",
        titulo: "La fórmula no se duplica ni se altera",
        parrafos: [
          "El anexo remite expresamente a M-01 Parte IV y al tabulador fuente para PC01, D, PC02, PC03, L, Mret y Alm. En DMS, los campos fuente y el motor de datos determinan el resultado; no hay una edición manual de la pena calculada.",
        ],
      },
    ],
  },
  {
    slug: "m02-matriz-de-aplicacion",
    manual: "M-02",
    parte: "Parte V",
    titulo: "Matriz de aplicación por operación y causa",
    descripcion:
      "Marco para cruzar contrato, quién origina la terminación, causa acreditada y tratamiento documentable.",
    fuentes: [{ documento: "M-02 v1.0", referencia: "Parte V" }],
    secciones: [
      {
        id: "clasificacion",
        titulo: "Clasifica antes de calcular",
        parrafos: [
          "La matriz cubre C-01, C-02, C-03 y C-04. Antes de usar una fórmula, identifica el contrato firmado, quién solicita o causa la terminación, la evidencia y si la causa es ordinaria, incumplimiento, exención o una alerta que impide continuar.",
        ],
      },
      {
        id: "regla-operativa",
        titulo: "Regla operativa",
        parrafos: [
          "El cálculo no decide la causa ni la autorización. Si los datos no sustentan la fila de la matriz, la operación queda pendiente de evidencia y escalamiento; no se registra una causa aproximada solo para obtener un importe.",
        ],
      },
    ],
  },
  {
    slug: "m02-procedimiento",
    manual: "M-02",
    parte: "Parte VI",
    titulo: "Procedimiento de cancelación y desistimiento",
    descripcion:
      "Secuencia de control aplicable a C-01, C-02, C-03 y C-04 cuando se solicita una cancelación o terminación anticipada.",
    fuentes: [{ documento: "M-02 v1.0", referencia: "Parte VI" }],
    secciones: [
      {
        id: "secuencia",
        titulo: "Secuencia obligatoria",
        parrafos: [
          "La solicitud se atiende contra el expediente y el contrato firmado. El resultado debe dejar la causa, importes fuente, fórmula aplicada o razón de exención, aprobación requerida y evidencia de devolución o liquidación.",
        ],
        pasos: [
          "Identifica el contrato y recupera su expediente, comprobantes de pago y anexos relevantes.",
          "Clasifica la causa con evidencia y determina si es pena, exención, incumplimiento o alerta de cumplimiento.",
          "Calcula desde los datos fuente que correspondan al contrato; verifica el tope y la política aplicable.",
          "Obtiene la autorización del nivel que marque la matriz cuando no sea un caso ordinario.",
          "Documenta el cierre, medio de pago o devolución y conserva comprobantes trazables en el expediente.",
        ],
      },
    ],
  },
  {
    slug: "m02-casos-borde",
    manual: "M-02",
    parte: "Parte VII",
    titulo: "Casos borde y tratamiento",
    descripcion:
      "Escenarios que no deben resolverse con una pena automática sin revisar la causa, la evidencia y el contrato aplicable.",
    fuentes: [{ documento: "M-02 v1.0", referencia: "Parte VII" }],
    aviso: {
      tipo: "warning",
      titulo: "No fuerces un caso borde",
      texto:
        "Estos escenarios requieren clasificación documentada. Cuando falte evidencia, haya copropiedad, pagos parciales o una alerta de cumplimiento, detente y escala antes de calcular o devolver.",
    },
    secciones: [
      {
        id: "proveedor-y-vicio",
        titulo: "Incumplimiento del proveedor y vicio oculto",
        parrafos: [
          "M-02 distingue el incumplimiento del proveedor de un desistimiento atribuible al cliente y contempla pena espejo en el supuesto que describe. Para vicio oculto detectado durante la vigencia del apartado, indica devolver el apartado sin pena y registrar el hallazgo de completitud en F-05 o F-06.",
        ],
      },
      {
        id: "imposibilidad-y-repuve",
        titulo: "Fuerza mayor y reporte REPUVE",
        parrafos: [
          "Para caso fortuito o fuerza mayor, M-02 pide evidencia razonable, documentación por N2/N3 y reprogramación o devolución sin pena. Si C-03 se detiene por reporte de robo en REPUVE antes de pago, lo trata como candado de pago condicionado, no como desistimiento penalizable.",
        ],
      },
      {
        id: "consignacion-y-devolucion",
        titulo: "Consignación y medio de devolución",
        parrafos: [
          "M-02 separa terminación ordinaria de C-04 de un incumplimiento grave para efectos de liquidación y moras. También indica conservar trazabilidad del medio de devolución y revisar controles PLD antes de cambiarlo.",
        ],
      },
      {
        id: "copropiedad-y-pago-parcial",
        titulo: "Copropiedad y pago parcial",
        parrafos: [
          "En copropiedad, M-02 exige identificar y documentar el consentimiento de todos los interesados que resulten obligados. Para pagos parciales, indica usar el monto efectivamente entregado y pactado como base; ante una reducción no exacta, recomienda criterio conservador y consulta antes de aplicar el máximo.",
        ],
      },
    ],
  },
  {
    slug: "m02-f12-propuesto",
    manual: "M-02",
    parte: "Parte VIII",
    titulo: "F-12 propuesto: acta de cancelación",
    descripcion:
      "Alcance del formato propuesto por M-02 para dejar evidencia de una pena aplicada o exenta.",
    fuentes: [{ documento: "M-02 v1.0", referencia: "Parte VIII" }],
    aviso: {
      tipo: "warning",
      titulo: "No disponible para operación",
      texto:
        "F-12 es una propuesta de M-02. No figura como formato operativo descargable de DMS ni modifica el índice M-01 hasta su revisión formal por Operaciones y validación legal externa.",
    },
    secciones: [
      {
        id: "objetivo",
        titulo: "Objetivo propuesto",
        parrafos: [
          "M-02 propone F-12 como acta de cancelación y aplicación de pena convencional para documentar tanto la aplicación como la exención, incluso cuando el resultado sea cero. No sustituye C-01, C-02, C-03 ni C-04.",
        ],
      },
      {
        id: "estado",
        titulo: "Estado en DMS",
        parrafos: [
          "Hasta que exista aprobación documentada, el equipo debe seguir los contratos, formatos y controles actualmente habilitados. No se debe crear un expediente paralelo ni imprimir un F-12 como si estuviera aprobado solo por aparecer en este anexo.",
        ],
      },
    ],
  },
  {
    slug: "m02-tabulador-recomendado",
    manual: "M-02",
    parte: "Parte IX",
    titulo: "Recomendación para tabuladores",
    descripcion:
      "Mejoras propuestas al tabulador sin modificar las fórmulas fuente ni reemplazar el criterio de autorización.",
    fuentes: [{ documento: "M-02 v1.0", referencia: "Parte IX" }],
    secciones: [
      {
        id: "recomendaciones",
        titulo: "Controles propuestos",
        parrafos: [
          "M-02 recomienda una hoja CANCELACIONES que replique las fórmulas de M-01, capture la causa mediante catálogo cerrado y muestre por qué una causa exenta produce cero. También recomienda una alerta cuando el resultado exceda la base permitida.",
        ],
      },
      {
        id: "limite",
        titulo: "Límite del tabulador",
        parrafos: [
          "El tabulador calcula, pero no decide. La causa, exención y autorización siguen la matriz y procedimiento del anexo. La implementación productiva se hace en el motor de datos y debe conservar los importes fuente y la regla aplicada.",
        ],
      },
    ],
  },
  {
    slug: "m02-fuentes-y-control",
    manual: "M-02",
    parte: "Parte X",
    titulo: "Fuentes y control de cambios",
    descripcion:
      "Alcance temporal del anexo y regla de validación antes de convertir una recomendación en operación o cambio contractual.",
    fuentes: [{ documento: "M-02 v1.0", referencia: "Parte X" }],
    aviso: {
      tipo: "warning",
      titulo: "Revisar antes de operar cambios",
      texto:
        "M-02 advierte que las leyes y normas citadas pueden cambiar. Antes de modificar un contrato, una cláusula o un formato propuesto, se requiere la validación legal externa que el propio anexo indica.",
    },
    secciones: [
      {
        id: "vigencia",
        titulo: "Vigencia de las fuentes",
        parrafos: [
          "El anexo se presenta como una referencia de julio de 2026. Para un caso que dependa de vigencia normativa, el equipo debe verificar la fuente aplicable y registrar la consulta o escalamiento en el expediente.",
        ],
      },
      {
        id: "cambios",
        titulo: "Control de cambios",
        parrafos: [
          "Los cambios de contratos, formatos, fórmulas y políticas deben pasar por el flujo formal de validación. La documentación ayuda a detectar lo que debe cambiar; no es por sí misma una autorización para cambiarlo.",
        ],
      },
    ],
  },
  {
    slug: "m01a-endosos-cierre-y-entrega",
    manual: "M-01A",
    parte: "Parte I",
    titulo: "Endosos: cierre en la venta y qué se entrega al cliente",
    descripcion:
      "Vacío real del M-01: el acto físico de cerrar el endoso el día de la venta, el paquete de propiedad que recibe el comprador y la anatomía de un endoso abierto, incluido su estatus jurídico ante la SCJN.",
    fuentes: [{ documento: "M-01 · Anexo A Rev. 3.1 (borrador)", referencia: "Sección A" }],
    aviso: {
      tipo: "warning",
      titulo: "Vacío real del M-01",
      texto:
        "El M-01 explica los tres escenarios de propiedad y qué hacer si el endoso se extravía, pero no documentaba el acto físico de cerrar el endoso el día de la venta ni el paquete de propiedad que recibe el comprador. Este anexo cubre ese vacío.",
    },
    secciones: [
      {
        id: "que-es-cerrar-un-endoso",
        titulo: "Qué es «cerrar» un endoso",
        parrafos: [
          "El endoso abierto vive firmado por el propietario anterior sin nombre del adquirente, resguardado en F-10. Cerrarlo es escribir en el reverso de la factura los datos del comprador final como adquirente, en su presencia, el día que firma el C-02.",
          "A partir de ese acto la propiedad queda registrada de particular a comprador, sin que el lote figure como propietario intermedio.",
        ],
      },
      {
        id: "procedimiento-de-cierre",
        titulo: "Procedimiento de cierre, paso a paso",
        parrafos: [
          "El original solo sale de resguardo cuando ya hay pago acreditado y el C-02 está listo para firma; el cierre queda listo para escanear y entregar contra el acta de entrega.",
        ],
        pasos: [
          "Sacar el original del resguardo F-10 con vale (quién, motivo, fecha). Nunca antes de tener el pago acreditado y el C-02 listo para firma.",
          "Verificar la identidad del adquirente con su F-03 cotejado. El nombre que se asentará en el endoso debe coincidir exacto con su identificación y con el C-02.",
          "Asentar al adquirente en el reverso de la factura, en el espacio del endoso abierto: nombre completo del comprador, fecha y firma donde el formato lo pida. Tinta azul, sin abreviar, sin tachar.",
          "Cancelar con línea continua cualquier renglón sobrante del reverso. Un endoso con espacio vivo es un cheque en blanco: misma disciplina que los formatos.",
          "Escanear antes de entregar, a 300 dpi y a color, con la nomenclatura VIN_FACTURA-ENDOSADA_AAAAMMDD.pdf. La copia certificada queda en el expediente; el original se va con el comprador.",
          "Entregar el original endosado contra F-11, listado como pieza en el acta de entrega. Lo que el F-11 dice es lo que se entrega.",
          "Cerrar el renglón en F-10: documento entregado, fecha y acuse del comprador.",
        ],
      },
      {
        id: "paquete-de-propiedad-por-escenario",
        titulo: "Qué se lleva el cliente, por escenario",
        parrafos: [
          "El documento de propiedad que recibe el comprador, y el resto del kit, cambian según el escenario de origen de la unidad.",
        ],
        tablas: [
          {
            encabezados: ["Escenario", "Documento de propiedad que recibe", "Además en el kit"],
            filas: [
              [
                "A. Endoso abierto",
                "Factura de origen original con el endoso ya cerrado a su nombre, más toda la cadena de facturas y endosos previos sin huecos.",
                "Copia certificada de la cadena, tarjeta de circulación si sigue vigente, comprobante de baja si se reemplazará, F-05, F-07, F-08.",
              ],
              [
                "B. El lote factura",
                "CFDI del lote a su nombre, timbrado y validado en el portal del SAT antes de la cita, más la cadena previa que forma el consecutivo.",
                "Igual que en el escenario A. Un CFDI cancelado en manos del cliente es queja segura: se valida el día anterior.",
              ],
              [
                "C. Consignación",
                "La propiedad pasa directo del consignante al comprador (arts. 392-393 del Código de Comercio): recibe la factura del consignante endosada o facturada a su nombre. El lote solo entrega el CFDI de su comisión por servicio, nunca por la unidad.",
                "El consignante debe estar localizable para firmar el endoso el día de la venta; se pacta desde el C-04.",
              ],
            ],
          },
        ],
      },
      {
        id: "casos-borde-de-endoso",
        titulo: "Casos borde de endoso",
        parrafos: [],
        tablas: [
          {
            encabezados: ["Situación", "Qué hacer"],
            filas: [
              [
                "El comprador quiere el endoso «en blanco» para revenderlo él",
                "No. El lote cierra el endoso a nombre de quien firma el C-02. Entregar un endoso abierto convierte al lote en un eslabón de una cadena que ya no controla; si el comprador es revendedor, que opere su propia cadena después.",
              ],
              [
                "El nombre del comprador tiene acento o segundo apellido dudoso",
                "Se asienta exacto como en su identificación oficial. Una discrepancia entre el endoso y la INE es un defecto de propiedad a futuro.",
              ],
              [
                "El comprador es persona moral",
                "El adquirente en el endoso es la razón social, no el representante. Se anexa quién firma por ella: poder e INE del representante, F-03 con beneficiario controlador.",
              ],
              [
                "El endoso previo de la cadena viene ilegible o incompleto",
                "La cadena se coteja antes de listar la unidad (F-08). Un eslabón defectuoso se resuelve con el emisor de esa factura o acreditación judicial antes de vender; no se hereda al comprador.",
              ],
              [
                "Se equivocaron al asentar al adquirente",
                "El endoso mal asentado no se tacha. Se documenta la corrección o reposición con el emisor de la factura; la unidad se congela (F-06 fuera de Listo para venta) mientras tanto. Escala N3, mismo trato que un endoso dañado.",
              ],
              [
                "Endoso abierto extraviado o dañado",
                "Pérdida más grave: N3 el mismo día, reposición vía el emisor o acreditación judicial, unidad congelada.",
              ],
            ],
          },
        ],
      },
      {
        id: "anatomia-del-endoso",
        titulo: "Endoso abierto: anatomía y qué debe contener",
        parrafos: [
          "El endoso se juzga en dos planos que no se mezclan. El anverso, la factura base, se autentica digitalmente: hoy es CFDI y su verdad vive en el SAT, no en el papel. El endoso manuscrito del reverso se juzga físicamente, con grafoscopía y documentoscopía.",
          "La factura es el documento base de propiedad; el endoso al reverso opera como cesión de derechos del propietario, el endosante o cedente, al adquirente o endosatario. «Abierto» o «en blanco» significa que está firmado por el endosante sin asentar adquirente. No es un título de crédito en sentido estricto, pero se verifica con el mismo rigor porque de él depende la cadena.",
        ],
        tablas: [
          {
            titulo: "Elementos que debe contener un endoso, aunque sea abierto",
            encabezados: ["#", "Elemento", "Regla"],
            filas: [
              ["1", "Referencia a la factura endosada", "En el reverso de esa misma factura, o en un anexo amarrado a ella; nunca en hoja suelta."],
              ["2", "Nombre del endosante (cedente)", "Exacto como el propietario del anverso y como su INE."],
              ["3", "Firma autógrafa del endosante", "Coincidente con su identificación. Elemento esencial."],
              ["4", "Leyenda de transmisión", "«Endoso la propiedad / cedo los derechos» o el texto del formato del reverso."],
              ["5", "Fecha del endoso", "Debe existir y ser lógica dentro de la cadena. Su ausencia es un flag a resolver."],
              ["6", "Espacio del adquirente", "En abierto: visiblemente en blanco o cancelado, nunca borroneado. Se cierra al comprador final al vender."],
              ["7", "Representación (persona moral)", "Razón social más la firma de quien la representa con poder."],
            ],
          },
        ],
        puntos: [
          "Faltando los elementos 1 a 3 no hay endoso: hay una firma huérfana y la unidad no avanza.",
        ],
      },
      {
        id: "verificacion-anverso-reverso-y-cadena",
        titulo: "Verificación: anverso, reverso y cadena",
        parrafos: [
          "En el anverso, si es CFDI se verifica en el portal del SAT por UUID o folio fiscal: que esté vigente, no cancelado, con emisor y receptor correctos y sello digital válido. Un CFDI cancelado con papel impecable equivale a propiedad inexistente; esta verificación nunca se omite. Si es factura impresa antigua, pre-CFDI, se revisan folio y membrete de agencia originales, sin reimpresión casera, y con lupa, nitidez y microtexto si lo hubiera. El VIN de la factura debe coincidir con el VIN físico en los tres puntos y con el número de motor.",
          "En el reverso se cotejan la naturalidad del trazo (la firma auténtica fluye; la imitación muestra temblor, lentitud, retoques o levantamientos de pluma antinaturales), la firma del endoso contra la de la INE y contra la del anverso si existe, buscando rasgos constantes y no un simple parecido global. Una firma demasiado idéntica a otra, o un surco sin tinta, sugiere calca. Tinta distinta entre el nombre y la firma, o en el espacio del adquirente, sugiere llenado en momentos o manos diferentes; una mano distinta en el adquirente sugiere un endoso abierto cerrado por un tercero no autorizado.",
          "La cadena se revisa con F-08: cada endoso debe ser posterior en fecha al anterior, el endosatario de un eslabón debe ser el endosante del siguiente con nombre idéntico, y no debe haber huecos entre el origen y el vendedor actual. Fechas que retroceden son señal de fabricación. El endoso abierto no cierra la cadena: queda de particular a en blanco hasta el día de la venta.",
        ],
      },
      {
        id: "alteraciones-cruces-externos-y-dictamen",
        titulo: "Alteraciones, cruces externos y dictamen",
        parrafos: [
          "Congelan la unidad, con escalamiento N3 y N4 si afecta identificación: borradura o raspado, corrector, enmienda o sobrescritura en nombre, fecha o adquirente; espacio del adquirente con textura de borrado; adquirente añadido en tinta o mano distinta; sustitución de hoja con papel, impresión o perforaciones que no empatan; firma sobre texto cancelado o en zona antinatural; VIN o número de motor «corregido».",
          "El papel puede ser perfecto y la propiedad falsa: siempre se cierra contra fuente. SAT para el UUID vigente, REPUVE para robo e inscripción, RUG para gravamen, INE del endosante y F-07 para adeudos.",
          "El dictamen se asienta en F-08 y F-07 con el estado del endoso, el cotejo firma-INE, el estatus del CFDI, si la cadena está completa o tiene un hueco, y si hay o no señales de alteración, con escaneo a 300 dpi. Con cualquier flag, la unidad queda congelada y se escala N3.",
        ],
        puntos: [
          "El piso hace verificación de razonabilidad: cotejo básico firma-INE, UUID, REPUVE, RUG y coherencia de la cadena, y decide si avanza o se detiene. No certifica autenticidad.",
          "Ante firma dubitada o sospecha fundada de falsificación, el dictamen definitivo corresponde a un perito en grafoscopía o documentoscopía, por la vía N4, no al asesor.",
        ],
      },
      {
        id: "estatus-juridico-del-endoso-abierto",
        titulo: "¿Se puede el endoso abierto firmado por el vendedor? Estatus jurídico",
        parrafos: [
          "Administrativamente sí: se usa a diario para el cambio de propietario. Jurídicamente no transmite propiedad por sí solo. La sola firma al reverso no es un endoso formal; es un indicio de que hubo compraventa, y solo acredita propiedad leído junto con el contrato.",
          "El Pleno de la SCJN, en la tesis P. XL/97 derivada del amparo en revisión 1125/95, fija que la propiedad de los automotores se transmite por compraventa, donación, permuta, herencia, pago de adeudo o prescripción, y no por endoso, figura propia de los títulos de crédito conforme a los artículos 29 y 33 de la Ley General de Títulos y Operaciones de Crédito. Firmar al reverso, por uso comercial, es indicio de la cesión o compraventa, no un endoso mercantil.",
          "El Octavo Tribunal Colegiado en Materia Civil del Primer Circuito, en el amparo directo 512/95, sostuvo que el endoso en blanco de una factura no es el medio idóneo para transmitir la propiedad; como endoso, no genera consecuencia jurídica. La contradicción de tesis 14/2017 de la Primera Sala, derivada de la CT 173/2014, abordó si el endoso o cesión en la factura basta para acreditar propiedad; el valor probatorio se debilita cuando falta el nombre del cedente o hay duda de quién firmó.",
          "El M-01 llama al endoso abierto «casi título al portador». Eso es correcto como descripción del riesgo: puede circular y ser mal usado como si fuera al portador. Es incorrecto respecto de su fuerza jurídica: como título es débil. El título real es el C-03 o C-02, el contrato de compraventa, junto con la factura o el CFDI; el endoso es respaldo, no la transmisión.",
        ],
        tablas: [
          {
            encabezados: ["#", "Caso", "¿Se puede?", "Regla Cliquéalo"],
            filas: [
              [
                "1",
                "Compra a particular; firma el reverso sin asentar adquirente (escenario A)",
                "Sí, operativo",
                "La propiedad la sostiene el C-03, el pago SPEI y el F-03, no el endoso. El endoso abierto es indicio e instrumento para cerrar al comprador final; nunca se depende del endoso solo.",
              ],
              [
                "2",
                "Reverso con solo una firma, sin nombre del cedente ni leyenda",
                "Débil, se trata como incompleto",
                "Se exige nombre del cedente igual al propietario del anverso, leyenda de cesión, lugar, fecha y firma. Sin eso, no se lista la unidad.",
              ],
              [
                "3",
                "Firma el reverso quien no es el propietario del anverso",
                "No",
                "Cotejo firma-INE contra el propietario del anverso. Firma de un tercero sin poder hace caer el indicio.",
              ],
              [
                "4",
                "Cliquéalo cierra el endoso al comprador final al vender",
                "Sí, vía correcta",
                "El comprador recibe la factura endosada a su nombre más el C-02, título real, más el CFDI. Se escanea antes de entregar.",
              ],
              [
                "5",
                "El comprador pide el endoso en blanco para revender, o carta factura",
                "No",
                "El endoso no actualiza el padrón ni libera responsabilidad; usar la carta factura para vender es señal de fraude. Se cierra al que firma el C-02.",
              ],
              [
                "6",
                "Litigio: un tercero reclama la propiedad de una unidad ya revendida",
                "—",
                "Gana el conjunto: C-03, pago trazable, F-03, F-08 y CFDI, no la firma al reverso sola. Por eso se arma el juego documental completo.",
              ],
            ],
          },
        ],
        puntos: [
          "El endoso abierto firmado por el vendedor se puede usar, pero se documenta siempre junto al contrato de compraventa y el pago trazable; nunca como prueba única de propiedad. Un endoso en blanco suelto, sin contrato detrás, es el papel que la jurisprudencia degrada a indicio, y el que pierde en juicio.",
        ],
      },
    ],
  },
  {
    slug: "m01a-casos-borde-datos-faltantes",
    manual: "M-01A",
    parte: "Parte II",
    titulo: "Casos borde por datos o documentos faltantes",
    descripcion:
      "Qué hacer cuando falta la identificación del origen o falta un documento de la unidad: la regla es que el dato faltante detiene su unidad, no la fila.",
    fuentes: [{ documento: "M-01 · Anexo A Rev. 3.1 (borrador)", referencia: "Sección B" }],
    secciones: [
      {
        id: "regla-marco",
        titulo: "Regla marco",
        parrafos: [
          "Un dato faltante detiene su unidad, no la fila. El faltante se documenta como pendiente en F-09 con banda roja y fecha compromiso; nada avanza a la derecha del F-06 mientras siga abierto.",
        ],
      },
      {
        id: "identificacion-del-origen",
        titulo: "Identificación del origen: vendedor o consignante",
        parrafos: [],
        tablas: [
          {
            encabezados: ["Falta", "Regla", "Ruta"],
            filas: [
              [
                "INE del vendedor (no la trae)",
                "Sin F-03 no hay operación; es obligación LFPIORPI, no cortesía. Arriba del umbral de identificación (376,565.10 pesos) la negativa a identificarse significa que no hay operación y se escala N3.",
                "Alternativas equivalentes: pasaporte mexicano vigente o cédula profesional con foto. «Luego la traigo» significa que la operación espera.",
              ],
              [
                "INE vencida o en trámite",
                "No se acepta ni con comprobante del trámite.",
                "Pasaporte vigente.",
              ],
              [
                "El nombre de la identificación no coincide con la factura",
                "La operación se detiene.",
                "Documento puente: acta de matrimonio, corrección ante la agencia emisora, o no hay operación. Nunca «se parece, pásale».",
              ],
              [
                "Sin comprobante de domicilio o sin RFC",
                "Domicilio y RFC son política interna, salvo que el umbral PLD o la facturación los exijan.",
                "Si la operación cruza el umbral o requiere CFDI, son obligatorios; abajo del umbral se levanta el F-03 igual y se maneja comercialmente.",
              ],
              [
                "Señales de alteración en la identificación",
                "No se confronta a la persona. La frase es «el sistema nos pide validarla, le confirmamos».",
                "Documentar y escalar N3 el mismo día; puede implicar un aviso PLD dentro de las 24 horas siguientes.",
              ],
            ],
          },
        ],
      },
      {
        id: "documentos-de-la-unidad",
        titulo: "Documentos de la unidad",
        parrafos: [],
        tablas: [
          {
            encabezados: ["Falta", "Riesgo", "Qué hacer"],
            filas: [
              [
                "Factura de origen (solo traen endoso, o se perdió la refactura)",
                "Sin factura no hay título; la cadena se rompe.",
                "Reposición vía el emisor, agencia o armadora, o juicio de acreditación de propiedad a costa del vendedor. Unidad congelada; no se compra «y luego reponemos».",
              ],
              [
                "Secuencia de facturas incompleta, con huecos en el consecutivo",
                "El lote no podría revender legalmente.",
                "El F-08 falla y no se firma. El vendedor repone el documento o acredita en juicio, a su costa; comprar así es heredar el problema.",
              ],
              [
                "Tarjeta de circulación",
                "Trámite pendiente, posible adeudo.",
                "Se puede reponer en la Hacienda estatal; se registra en F-09, verificando que la falta no esconda un adeudo o una baja pendiente.",
              ],
              [
                "Falta una placa",
                "Bloquea la baja.",
                "Se requiere acta o constancia de extravío ante autoridad antes de tramitar la baja. Renglón en F-09.",
              ],
              [
                "Número de motor no coincide con la factura",
                "Posible alteración de identificación.",
                "Se asienta en F-05 con foto. Si se detecta después de comprar, aplica la cláusula tercera inciso c) del C-03, reclamación formal y escalamiento N4; no se suaviza.",
              ],
              [
                "VIN no coincide en los tres puntos: parabrisas, marco de puerta y factura",
                "Alteración grave.",
                "No se avanza. La coincidencia en los tres puntos es requisito; se documenta y se escala N3 o N4.",
              ],
              [
                "REPUVE con reporte de robo",
                "Delito.",
                "No se compra, no se confronta, no se retiene por la fuerza. La frase es «el sistema tarda, le confirmamos». Se documenta la salida y se escala N3 de inmediato; la seguridad del personal va primero.",
              ],
              [
                "Adeudos descubiertos en F-07",
                "Bloquean trámites.",
                "Dos rutas: el vendedor liquida y presenta comprobante, o se descuenta del precio con su firma en observaciones. Nunca «lo arreglamos después»; quién cubre se pacta antes de firmar.",
              ],
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "m01a-operaciones-legales-especificas",
    manual: "M-01A",
    parte: "Parte III",
    titulo: "Operaciones legales específicas",
    descripcion:
      "Sucesión, copropiedad, apoderado, persona moral, gravamen y vehículo importado: casos que el M-01 nombra al pasar pero no procedimenta.",
    fuentes: [{ documento: "M-01 · Anexo A Rev. 3.1 (borrador)", referencia: "Sección C" }],
    aviso: {
      tipo: "warning",
      titulo: "Validación previa obligatoria",
      texto:
        "Todos los casos de esta sección se validan con el abogado del lote (N4) antes de firmar. El asesor no improvisa la vía.",
    },
    secciones: [
      {
        id: "vendedor-fallecido-sucesion",
        titulo: "Vendedor fallecido o sucesión",
        parrafos: [
          "Un heredero no vende por sí solo con «es de mi papá». Se requiere acreditar la representación de la sucesión: un albacea designado por vía testamentaria o intestamentaria con carta de aceptación del cargo, o la adjudicación ya hecha a nombre del heredero que vende.",
          "Sin sucesión resuelta no hay operación; se escala N4. Se documenta en las observaciones del C-03 el instrumento sucesorio, con juzgado o notaría, fecha y folio, y se anexa copia cotejada al F-06.",
        ],
      },
      {
        id: "copropiedad-y-sociedad-conyugal",
        titulo: "Copropiedad o sociedad conyugal",
        parrafos: [
          "Si la factura nombra a dos o más propietarios, todos firman el endoso o la venta, o uno lo hace con poder de los demás. Si el bien se adquirió en sociedad conyugal, el cónyuge concurre o extiende poder; no basta la firma de quien aparece en la factura si el régimen es de sociedad.",
          "Se levanta un F-03 por cada copropietario que firma.",
        ],
      },
      {
        id: "firma-por-apoderado",
        titulo: "Firma por apoderado",
        parrafos: [
          "Se levantan dos F-03: uno del propietario y uno del apoderado. En el poder se verifica que faculte el acto específico de vender o comprar el vehículo, que no esté revocado, con manifestación bajo protesta, y su fecha.",
          "Para actos de dominio, que transmiten propiedad, el instrumento debe ser suficiente para ese acto; una carta poder simple puede no bastar. El alcance del poder lo valida N4 antes de firmar, usando el instrumento mínimo que faculte el acto específico, sin sobre-exigir.",
        ],
      },
      {
        id: "venta-a-persona-moral",
        titulo: "Venta a persona moral o factura a empresa",
        parrafos: [
          "Se puede facturar a una empresa solo con KYC completo del tercero mediante F-03 e identificación del beneficiario controlador; es obligación LFPIORPI, no cortesía. La negativa a identificarlo significa que no hay operación y se escala N3.",
          "El adquirente en el CFDI o en el endoso es la razón social; el representante firma con poder e INE.",
        ],
      },
      {
        id: "credito-vigente-gravamen-reserva-de-dominio",
        titulo: "Unidad con crédito vigente, gravamen o reserva de dominio",
        parrafos: [
          "La factura puede decir «con reserva de dominio» o nombrar a una financiera como propietaria. Mientras exista gravamen, el particular no puede transmitir la unidad libre de gravamen.",
          "Para comprar o recibir la unidad se requiere carta de liberación de gravamen o factura liberada por la financiera, y verificar además el Registro Único de Garantías Mobiliarias. Sin liberación no se libera el pago; se recibe solo con un plan escrito de liquidación, con el mismo trato que una consignada con adeudos.",
        ],
      },
      {
        id: "vehiculo-importado-o-legalizado",
        titulo: "Vehículo importado o legalizado",
        parrafos: [
          "Debe existir pedimento de importación y la unidad debe estar inscrita en REPUVE; la consulta por NIV en REPUVE cruza reportes de robo de Estados Unidos y Canadá.",
          "Para la regularización de vehículos usados de procedencia extranjera se verifica que el proceso oficial vigente esté cumplido; el costo de regularización en el registro vehicular ha sido de referencia 2,500 pesos por unidad. Sin pedimento ni inscripción no se compra; se escala N4 por procedencia.",
        ],
      },
      {
        id: "menor-de-edad-involucrado",
        titulo: "Menor de edad involucrado",
        parrafos: [
          "Un menor no firma. Una unidad a nombre de un menor solo se opera con representación legal acreditada, por patria potestad o tutela, y con revisión N4 antes de firmar.",
        ],
      },
    ],
  },
  {
    slug: "m01a-revision-de-adeudos",
    manual: "M-01A",
    parte: "Parte IV",
    titulo: "Cómo revisar adeudos: protocolo F-07 ampliado",
    descripcion:
      "Orden de verificación del día 0, cómo se asienta el renglón en F-07 y las reglas duras que no admiten excepción.",
    fuentes: [{ documento: "M-01 · Anexo A Rev. 3.1 (borrador)", referencia: "Sección D" }],
    secciones: [
      {
        id: "objetivo-y-disciplina-del-f07",
        titulo: "Objetivo y disciplina del F-07",
        parrafos: [
          "El renglón del F-07 debe quedar con concepto, monto, fecha de corte, fuente (URL o ventanilla) y fecha de consulta, respaldado con captura de pantalla o impresión con fecha visible. Los portales cambian sin aviso, por eso se registra fuente y fecha.",
          "Quién cubre cada adeudo se pacta por escrito antes de firmar, como candado del C-03.",
        ],
      },
      {
        id: "orden-de-verificacion",
        titulo: "Orden de verificación, todas en el día 0 y en paralelo",
        parrafos: [],
        puntos: [
          "REPUVE, federal, gratis: robo e inscripción. Portal ciudadano www2.repuve.gob.mx:8080/ciudadania/consulta. Se busca por VIN, placa sin guiones ni espacios, o folio de constancia; la consulta por NIV cruza reportes de robo de Estados Unidos y Canadá. Resultado posible: sin reporte, recuperado o robo vigente. Se exporta el PDF y se adjunta al F-07; con reporte de robo aplica el protocolo del caso: no comprar, no confrontar, N3.",
          "Jalisco, Hacienda estatal, gratis: refrendo, tenencia histórica y multas estatales. Portal de la Secretaría de la Hacienda Pública: gobiernoenlinea1.jalisco.gob.mx/serviciosVehiculares/adeudos. Requiere placa y número de serie, y según el sistema nombre del propietario o número de motor tal cual la tarjeta de circulación. Alternativa por SMS al 90123, enviando ADEUDO más la placa. Desglosa refrendo del año, multas, recargos y pagos pendientes de años anteriores.",
          "Estado emisor, para baja o adeudo foráneo: si la unidad está emplacada en otro estado, la consulta y la baja se hacen ante la hacienda de ese estado, y algunos exigen no-adeudo local previo. Se cotiza costo y tiempo del gestor antes de comprometer fecha de entrega; el F-09 registra como responsable al gestor y al estado emisor.",
          "Municipal, fotoinfracciones y movilidad: las infracciones también viven en portales municipales cuando aplique; se revisa el municipio de circulación además del estatal.",
          "Gravamen o reserva de dominio: se lee la factura, si dice «con reserva de dominio» o nombra una financiera, y se consulta el Registro Único de Garantías Mobiliarias en rug.gob.mx por nombre del titular o datos de la garantía. Un gravamen vivo bloquea la transmisión libre.",
        ],
      },
      {
        id: "como-se-asienta-en-f07",
        titulo: "Cómo se asienta en el F-07",
        parrafos: [],
        tablas: [
          {
            titulo: "Ejemplo de renglón",
            encabezados: ["Campo", "Valor"],
            filas: [
              ["Concepto", "Refrendo 2024-2025 (Jalisco)"],
              ["Monto", "Corte del día"],
              ["Fecha de corte", "Fecha de la consulta"],
              ["Fuente", "gobiernoenlinea1.jalisco.gob.mx/serviciosVehiculares/adeudos"],
              ["Fecha de consulta", "Misma fecha, con captura adjunta con fecha visible"],
              ["Cubre", "Vendedor liquida antes de pago, o se aplica descuento en precio con firma en observaciones"],
            ],
          },
        ],
      },
      {
        id: "reglas-duras-del-f07",
        titulo: "Reglas duras del F-07",
        parrafos: [],
        puntos: [
          "Sin costo visible en la captura no hay evidencia; la impresión o captura con fecha es la evidencia.",
          "Ninguna consulta oficial se sustituye por sitios de terceros. Los agregadores privados sirven para orientación rápida; el renglón del F-07 se cierra contra la fuente oficial: REPUVE, Hacienda del estado o RUG.",
          "Un portal caído no libera el estatus. Se documenta el intento con captura con fecha y se reprograma; la unidad no avanza «porque el portal no sirve».",
          "Una baja entregada por el vendedor se verifica contra la fuente, con folio en el portal o ventanilla. Una baja falsa contamina todo el consecutivo.",
        ],
      },
    ],
  },
  {
    slug: "m01a-eficiencias-legales-y-linea-roja",
    manual: "M-01A",
    parte: "Parte V",
    titulo: "Eficiencias legales legítimas y la línea roja del fraude",
    descripcion:
      "Nueve optimizaciones de proceso y costo legales, cada una con su riesgo y su línea roja, más la línea roja global de conductas que nunca son «eficiencia».",
    fuentes: [{ documento: "M-01 · Anexo A Rev. 3.1 (borrador)", referencia: "Sección E" }],
    aviso: {
      tipo: "warning",
      titulo: "No es autorización para brincar el M-01",
      texto:
        "Estas son optimizaciones legales de proceso y costo, cada una con su riesgo y su línea roja: el punto donde la eficiencia se vuelve ilícito. Ninguna sustituye el KYC, el PLD ni el candado del F-06.",
    },
    secciones: [
      {
        id: "endoso-abierto-en-lugar-de-refacturar",
        titulo: "E.1 · Endoso abierto en lugar de refacturar",
        parrafos: [
          "Qué ahorra: el lote no se agrega como propietario intermedio, la cadena queda más corta, sin costo ni tiempo de refacturar, y el comprador recibe una cadena de particular a particular limpia. Es la ventaja legítima que el propio M-01 reconoce.",
          "Cuándo aplica: compra a un particular que endosa sin asentar adquirente, y el lote no necesita constar como dueño por régimen fiscal, lo que define contabilidad.",
          "Riesgo: baja probabilidad, impacto medio, reversible. El endoso abierto es casi título al portador: vive en F-10 y nunca circula suelto.",
        ],
        puntos: [
          "Línea roja: omitir o «perder» facturas intermedias para mostrar «menos dueños» es fraude documental. La cadena es la que es.",
        ],
      },
      {
        id: "consignacion-para-no-tomar-propiedad",
        titulo: "E.2 · Escenario de consignación para no tomar propiedad",
        parrafos: [
          "Qué ahorra: el lote no compra la unidad, factura solo su comisión de servicio. Menos capital inmovilizado, sin IVA sobre el valor de la unidad, solo sobre la comisión; el riesgo de propiedad queda en el consignante. Base legal: artículos 392 y 393 del Código de Comercio.",
          "Riesgo: baja probabilidad, impacto bajo, reversible. Requiere que el consignante esté localizable para endosar el día de la venta, algo que se pacta desde el C-04.",
        ],
        puntos: [
          "Línea roja: simular consignación cuando en realidad el lote compró, para diferir impuestos, es simulación fiscal. Si el consignante pide que el lote «le facture la unidad», eso ya es compra más venta, dos actos, y es decisión N3 con contabilidad.",
        ],
      },
      {
        id: "modelos-profeco-preaprobados",
        titulo: "E.3 · Modelos de contrato pre-aprobados por PROFECO",
        parrafos: [
          "Qué ahorra: PROFECO publica modelos de contrato de adhesión pre-aprobados, por ejemplo de AMDA; adoptarlos acelera el registro obligatorio de C-02 y C-04, cuyo número debe constar en el formato.",
          "Riesgo: nulo. Es la vía oficial rápida.",
        ],
        puntos: [
          "Línea roja: operar C-02 o C-04 sin registro PROFECO es sancionable y debilita el contrato ante una queja.",
        ],
      },
      {
        id: "ventana-de-descuento-del-refrendo",
        titulo: "E.4 · Ventana de descuento del refrendo en Jalisco",
        parrafos: [
          "Qué ahorra, como referencia 2026 a verificar cada año en la fuente: pagar el refrendo en línea entre enero y febrero da aproximadamente 5% de descuento, con verificación vehicular gratuita incluida, hasta 60-80% de descuento en multas y recargos, y hasta 70% en cambio de propietario, altas y bajas. Programar los trámites de las unidades en inventario dentro de la ventana traslada ahorro real al cierre y es argumento de venta para el cliente.",
          "Riesgo: bajo, reversible. Depende del calendario estatal, que cambia cada año; se confirma en refrendo.jalisco.gob.mx o directamente con la Hacienda estatal.",
        ],
        puntos: [
          "Línea roja: ninguna, es un beneficio publicado. Solo no se promete al cliente un descuento cuya vigencia no se verificó.",
        ],
      },
      {
        id: "batching-de-tramites",
        titulo: "E.5 · Batching de trámites y ventanas fijas de autorización",
        parrafos: [
          "Qué ahorra: agrupar bajas y altas del mismo tipo en una corrida, no de una en una, y concentrar las autorizaciones N2 en dos ventanas fijas al día.",
          "Riesgo: nulo. Es diseño de flujo.",
        ],
        puntos: ["Línea roja: ninguna, mientras cada trámite conserve su fecha compromiso en F-09."],
      },
      {
        id: "precaptura-del-expediente",
        titulo: "E.6 · Pre-captura del expediente antes de la cita",
        parrafos: [
          "Qué ahorra: los datos de la unidad y del expediente se llenan antes de la cita, ya que viven en el DMS. Con el cliente solo se capturan sus propios datos con identificación a la vista, sus decisiones y firmas; elimina fricción y errores por prisa.",
          "Riesgo: nulo.",
        ],
        puntos: [
          "Línea roja: la presencia del cliente es para identidad y consentimiento, no para mecanografía, pero jamás se llenan sus decisiones, como radios o garantía, por él.",
        ],
      },
      {
        id: "instrumento-de-representacion-minimo",
        titulo: "E.7 · Instrumento de representación mínimo suficiente",
        parrafos: [
          "Qué ahorra: no exigir poder notarial donde la ley permite un instrumento más simple, ni aceptar uno insuficiente donde la ley exige más. Usar el instrumento mínimo que faculte el acto específico acelera sin exponer al lote.",
          "Riesgo: medio si se juzga mal el alcance; por eso el alcance del poder lo valida N4 antes de firmar.",
        ],
        puntos: [
          "Línea roja: aceptar un poder que no faculte el acto de dominio, o que esté revocado, es una venta atacable. La duda se resuelve arriba, no en el piso.",
        ],
      },
      {
        id: "carta-responsiva-y-baja-administrativa",
        titulo: "E.8 · Carta responsiva y baja administrativa como escudo de infracciones",
        parrafos: [
          "Qué ahorra: al vender, la cláusula sexta del C-02 obliga al comprador a hacer el cambio de propietario en 10 días naturales; al día 15 sin acreditarlo, el lote tramita la baja administrativa ante la Hacienda estatal. Eso protege al lote de que las infracciones del comprador lleguen a su nombre.",
          "Riesgo: bajo, si se ejecuta el requerimiento documentado al día 10.",
        ],
        puntos: [
          "Línea roja: dejarlo pasar «para no molestar». Las infracciones siguen llegando a nombre del lote mientras el padrón no se actualice.",
        ],
      },
      {
        id: "linea-roja-global",
        titulo: "E.9 · Línea roja global: lo que nunca es «eficiencia»",
        parrafos: [
          "Ninguna prisa ni ahorro justifica estas conductas. Todas son delito o causal de sanción, y ya están prohibidas en el M-01.",
        ],
        puntos: [
          "Alterar, omitir o «perder» facturas del consecutivo: fraude documental.",
          "Fraccionar el pago para «librar» el umbral PLD de 376,565.10 pesos, conforme al artículo 32 fracción II de la LFPIORPI: es exactamente la conducta que la ley persigue.",
          "Antedatar o posdatar fechas o firmas.",
          "Timbrar un CFDI que la cadena no soporta.",
          "Simular consignación cuando hubo compra.",
          "Retener una unidad o documentos ajenos como presión; se reclama como despojo.",
          "Firmar con campos en blanco, o llenar por el cliente sus decisiones.",
        ],
      },
    ],
  },
  {
    slug: "m01a-mapeo-jurisprudencia-y-normatividad",
    manual: "M-01A",
    parte: "Parte VI",
    titulo: "Mapeo a formatos, jurisprudencia y normatividad",
    descripcion:
      "Qué formato y nivel de escalamiento alimenta cada procedimiento del anexo, el respaldo jurisprudencial de la SCJN sobre endoso y factura, y la normatividad pendiente de revisión.",
    fuentes: [{ documento: "M-01 · Anexo A Rev. 3.1 (borrador)", referencia: "Secciones F y G" }],
    aviso: {
      tipo: "info",
      titulo: "Referencias sujetas a cambio",
      texto:
        "Respaldan A.5.8 (endoso), E.3 (modelos PROFECO) y el capítulo PLD del M-01. Verifica en la fuente antes de citar en un asunto; los montos, descuentos y URLs corresponden a julio de 2026.",
    },
    secciones: [
      {
        id: "mapeo-a-formatos-y-escalamiento",
        titulo: "Mapeo a formatos y nivel de escalamiento",
        parrafos: [],
        tablas: [
          {
            encabezados: ["Procedimiento de este anexo", "Formatos que alimenta", "Nivel"],
            filas: [
              ["Cierre de endoso en la venta (sección A)", "F-08, F-10, F-11, C-02", "N1; extravío o error escala a N3"],
              [
                "Datos o documentos faltantes del origen (sección B)",
                "F-03, F-06, F-07, F-09 con banda roja",
                "N1; señales de alteración o robo escalan a N3; VIN o motor alterado escala a N4",
              ],
              [
                "Sucesión, copropiedad, apoderado, persona moral, gravamen, importado (sección C)",
                "F-03, F-06, F-07; observaciones del C-03 o C-04",
                "N4, validación previa",
              ],
              ["Revisión de adeudos (sección D)", "F-07 con captura y fecha, F-09", "N1; baja dudosa o adeudo grande escala a N2"],
              [
                "Eficiencias legales (sección E)",
                "Según el proceso; contabilidad para los escenarios aplicables",
                "N2 o N3 donde toca una decisión de dinero o fiscal",
              ],
            ],
          },
        ],
        puntos: [
          "Regla de oro heredada, siempre vigente: nada avanza a la derecha del F-06 si no está en Listo para venta; nada se entrega en F-11 sin C-02 firmado y pago verificado. Este anexo no crea excepciones a esa regla, la refuerza.",
        ],
      },
      {
        id: "jurisprudencia-y-criterios-scjn",
        titulo: "Jurisprudencia y criterios sobre propiedad vehicular, endoso y factura",
        parrafos: [
          "Este cuadro es el respaldo jurisprudencial de A.5.8. Las tesis y sentencias se recuperaron por Legal Data Hunter contra la fuente de datos abiertos de la SCJN; los textos oficiales viven en bj.scjn.gob.mx/datos-abiertos/documento/tesis/[registro].",
        ],
        tablas: [
          {
            encabezados: ["Criterio", "Qué fija", "Uso"],
            filas: [
              [
                "Tesis P. XL/97, Pleno SCJN, amparo en revisión 1125/95 (registro 199237)",
                "La firma al reverso de la factura no es endoso; es indicio de traslación de dominio.",
                "A.5.8",
              ],
              [
                "Registro 203775, Octavo T.C. en Materia Civil del 1er Circuito, amparo directo 512/95",
                "El endoso en blanco de una factura no es medio idóneo para transmitir propiedad.",
                "A.5.8",
              ],
              [
                "«Facturas de automotores. Validez del endoso», SCJN, registro 191644",
                "El endoso debe constar asentado al reverso para surtir efectos en una tercería excluyente de dominio.",
                "A.5.1 / A.5.8",
              ],
              [
                "«Carta factura. Por regla general es insuficiente para acreditar la propiedad de un vehículo», SCJN, registro 165603",
                "El documento idóneo es la factura; la carta factura, por regla general, no basta.",
                "A.5.8",
              ],
              [
                "«Carta factura. Valoración de los elementos aportados para adminicularla», SCJN, registro 165602",
                "Cómo se concatenan las pruebas para acreditar propiedad.",
                "A.5.8, caso 6",
              ],
              [
                "1a./J. 74/2014, contradicción de tesis 173/2014, Primera Sala",
                "Requisitos del endoso cuando lo emite una persona física en nombre de una persona moral.",
                "A.5.1 / C.4",
              ],
              [
                "Contradicción de tesis 14/2017, Primera Sala, sentencia 164274",
                "Contradicción sobre si el endoso o cesión en la factura basta para acreditar propiedad.",
                "A.5.8",
              ],
              [
                "1a./J. 4/2021, precedente 185/2020, tesis registro 2022970, sentencia 208674, Primera Sala",
                "La carta factura, concatenada con otros medios de prueba, puede acreditar propiedad en una tercería excluyente de dominio.",
                "Refuerza «gana el conjunto» de A.5.8, caso 6",
              ],
              [
                "Sala 9, Tribunal Superior de Justicia de Jalisco, Toca 94/2017",
                "Aplica los puntos 5.2 y 5.2.1 de la NOM-122-SCFI-2010 en litigio local, en esta jurisdicción.",
                "Sección C y marco general",
              ],
            ],
          },
        ],
        puntos: [
          "Legal Data Hunter es fuerte para jurisprudencia mexicana, SCJN y sentencias de tribunales de Jalisco, pero débil para legislación federal: no indexa LFPIORPI, NOM-122, Código de Comercio ni la Ley General de Títulos y Operaciones de Crédito. Regla de uso: Legal Data Hunter para tesis y sentencias; acceso directo al DOF o a PROFECO para el texto de leyes y NOMs.",
        ],
      },
      {
        id: "normatividad-pendiente-de-revision",
        titulo: "Normatividad y actualización pendiente de revisión",
        parrafos: [
          "La NOM-122-SCFI-2010 fija los elementos de los contratos de adhesión de usados en sus puntos 5.2 y 5.2.1.",
          "La reforma al Reglamento de la LFPIORPI publicada en el DOF el 27 de marzo de 2026, la primera desde 2013, exige monitoreo automatizado y auditorías para los sujetos obligados, e impacta a las automotrices. Es una acción pendiente, a nivel N2 o N3 con el contador y el abogado del lote: evaluar si el PLD manual de Cliquéalo debe migrar a un monitoreo con acumulación automática y avisos en XML.",
          "El 20 de junio de 2026, el SAT y la UIF ofrecieron un webinar oficial sobre Actividades Vulnerables conforme a la LFPIORPI; el padrón nacional reporta alrededor de 218,000 sujetos obligados.",
        ],
      },
      {
        id: "modelos-profeco-y-capacitacion-pld",
        titulo: "Modelos PROFECO, AMDA y capacitación PLD para automotrices",
        parrafos: ["Estas referencias respaldan la eficiencia E.3."],
        puntos: [
          "AMDA, «PROFECO Registro y Contratos de Adhesión»: modelos NOM-122 para usados y NOM-160 para nuevos.",
          "PROFECO, Registro Público de Contratos de Adhesión: modelos tipo de compraventa de vehículo usado al contado ya inscritos.",
          "TaxDay: curso «Venta de vehículos, PLD/FT actividad vulnerable», de tres horas.",
          "IMEFI: curso «Venta de automóviles, obligaciones de PLD por actividad vulnerable», de tres horas, y diplomado de PLD de 80 horas.",
          "IPROFI: cursos de cumplimiento LFPIORPI y antilavado.",
          "KYC Systems: guía «Comercialización de vehículos: actividad vulnerable» y software de cumplimiento.",
        ],
      },
      {
        id: "prevencion-de-fraude-guion-de-verificacion",
        titulo: "Prevención de fraude: insumo para el guion de verificación",
        parrafos: [
          "PROFECO, junto con la Revista del Consumidor de noviembre de 2025 en colaboración con Kavak, reporta que hasta 40% de las operaciones entre particulares presenta alguna irregularidad: documentos falsificados, adeudos ocultos o clonación de vehículos. Las recomendaciones oficiales son verificar la identidad del vendedor, exigir documentos originales, consultar REPUVE, evitar el efectivo y no pagar por adelantado. Esto se convierte en guion de verificación para los asesores de piso.",
        ],
      },
    ],
  },
];

export const ARBOL_MANUALES: Root = {
  name: "Manual operativo",
  children: [
    {
      type: "page",
      name: "Inicio de documentación",
      url: "/manuales",
    },
    {
      type: "folder",
      name: "M-01 · Libro de consulta",
      defaultOpen: true,
      children: MANUALES.filter((manual) => manual.manual === "M-01").map((manual) => ({
        type: "page" as const,
        name: `${manual.parte} · ${manual.titulo}`,
        url: `/manuales/${manual.slug}`,
      })),
    },
    {
      type: "folder",
      name: "M-01 · Anexo A (borrador)",
      defaultOpen: true,
      children: MANUALES.filter((manual) => manual.manual === "M-01A").map((manual) => ({
        type: "page" as const,
        name: `${manual.parte} · ${manual.titulo}`,
        url: `/manuales/${manual.slug}`,
      })),
    },
    {
      type: "folder",
      name: "M-02 · Anexo de cancelaciones",
      defaultOpen: true,
      children: MANUALES.filter((manual) => manual.manual === "M-02").map((manual) => ({
        type: "page" as const,
        name: `${manual.parte} · ${manual.titulo}`,
        url: `/manuales/${manual.slug}`,
      })),
    },
  ],
};

export function manualPorSlug(slug: string) {
  return MANUALES.find((manual) => manual.slug === slug);
}

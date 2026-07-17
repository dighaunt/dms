import type { Root } from "fumadocs-core/page-tree";

export type ManualFuente = {
  documento: string;
  referencia: string;
};

export type ManualSeccion = {
  id: string;
  titulo: string;
  parrafos: string[];
  puntos?: string[];
  pasos?: string[];
};

export type ManualArticulo = {
  slug: string;
  manual: "M-01" | "M-02";
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

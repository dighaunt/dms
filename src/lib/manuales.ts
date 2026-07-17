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
    titulo: "Organizacion, roles y gobierno",
    descripcion:
      "La referencia para saber quien ejecuta, quien verifica y cuando debe escalarse una decision documental.",
    fuentes: [{ documento: "M-01 Rev. 3.0", referencia: "pp. 3-5" }],
    secciones: [
      {
        id: "proposito",
        titulo: "Proposito del libro",
        parrafos: [
          "M-01 organiza la operacion documental de la unidad desde su ingreso hasta la entrega. La captura debe conservar la evidencia que sustenta cada estado y cada movimiento de dinero.",
          "Los documentos firmados, sus anexos cotejados y el expediente son la fuente de verdad. La interfaz sirve para registrar y consultar el proceso, no para reemplazar el documento fuente.",
        ],
      },
      {
        id: "roles",
        titulo: "Roles y responsabilidades",
        parrafos: [
          "El manual asigna responsabilidades diferenciadas para operacion, control documental, autorizacion y direccion. Antes de cerrar un paso, el responsable confirma que cuenta con los soportes y firmas exigidos.",
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
          "La matriz RACI de M-01 evita que una sola persona capture, autorice y cierre una excepcion sin control cruzado. Consulta la matriz antes de asignar un caso que tenga impacto contractual, de pago o de custodia.",
        ],
        puntos: [
          "Responsable: ejecuta la actividad y deja evidencia.",
          "Aprobador: asume la decision cuando el proceso pide autorizacion.",
          "Consultado: aporta revision tecnica, documental o de cumplimiento.",
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
          "Esta parte describe el ciclo documental de compra directa, consignacion y venta, y establece controles para que las decisiones tengan evidencia verificable.",
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
          "El ciclo pasa por ingreso de la unidad, identificacion de contraparte, inspeccion, integracion del expediente, tramites aplicables, venta y entrega. Cada etapa tiene documentos que habilitan la siguiente.",
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
          "El operador identifica a la contraparte con los originales a la vista, coteja datos de unidad y documentos de propiedad, y conserva las copias que el formato exige. Los originales de identificacion se devuelven en el acto.",
          "Cuando un contrato o formato exige dos tantos, uno se entrega a la contraparte y el otro se integra al expediente. El tanto del expediente se escanea el mismo dia cuando el flujo lo exige.",
        ],
        puntos: [
          "Verifica VIN, identidad, fecha e importes antes de firmar.",
          "No adivines una cadena de endosos ni completes nombres que no coinciden.",
          "Registra correcciones con trazabilidad; no ocultes un error mediante sobreescritura silenciosa.",
        ],
      },
      {
        id: "documentos-y-resguardo",
        titulo: "Factura, endosos, tramites y resguardo",
        parrafos: [
          "La factura de origen y la cadena de endosos se validan contra la unidad y la contraparte. Los originales y llaves se controlan con F-10 mientras la unidad permanece en inventario.",
          "Los tramites vehiculares se registran con responsable, evidencia y fecha real. La comunicacion al cliente se basa en el F-09 y no en una fecha estimada no respaldada.",
        ],
      },
      {
        id: "pld-y-garantia",
        titulo: "PLD, garantia y comunicacion",
        parrafos: [
          "M-01 concentra los controles PLD, las condiciones de garantia, los guiones de comunicacion y las reglas de entrega. Las alertas no se resuelven modificando datos ni prometiendo una salida al cliente.",
        ],
        puntos: [
          "Ante efectivo en umbral, inconsistencia de identidad, REPUVE o presion por pago, detente y escala.",
          "Los dias y kilometros de garantia deben provenir de la politica y contrato aplicable, no de un acuerdo verbal.",
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
      "Indice operativo de formatos F-01 a F-11 y contratos C-01 a C-04, con el documento madre y el punto del ciclo que habilitan.",
    fuentes: [{ documento: "M-01 Rev. 3.0", referencia: "pp. 29-36" }],
    secciones: [
      {
        id: "formatos",
        titulo: "Formatos operativos",
        parrafos: [
          "Los formatos sostienen el expediente desde la adquisicion hasta la entrega. Se usan junto con el contrato que origine la operacion y se conservan con sus soportes.",
        ],
        puntos: [
          "F-01 ingreso o compra directa; F-02 acuerdo de consignacion; F-03 identificacion de contraparte; F-04 recibo de compraventa.",
          "F-05 inspeccion fisica; F-06 caratula y checklist maestro; F-07 verificacion de adeudos y situacion; F-08 validacion de factura y endosos.",
          "F-09 control de tramites; F-10 vale de resguardo de documentos y llaves; F-11 acta de entrega de unidad.",
        ],
      },
      {
        id: "contratos",
        titulo: "Contratos fuente",
        parrafos: [
          "C-03 es la compraventa cuando el lote adquiere una unidad y C-04 es la consignacion mercantil. Ambos originan el expediente de adquisicion. C-01 aparta una unidad para venta y C-02 formaliza su venta al comprador.",
        ],
        puntos: [
          "C-01 y C-02 solo se emiten cuando F-06 confirma Listo para venta.",
          "C-02, con pago verificado y el tanto escaneado, habilita el acta F-11.",
          "F-11 firmado y escaneado cierra la entrega de la unidad.",
        ],
      },
      {
        id: "validacion",
        titulo: "Validacion antes de operar",
        parrafos: [
          "M-01 exige validar los formatos y contratos antes de operar cambios formales. Un archivo disponible para descarga no significa que una clausula, formato nuevo o modificacion contractual este autorizado para uso productivo.",
        ],
      },
    ],
  },
  {
    slug: "m01-calculos-y-tablas",
    manual: "M-01",
    parte: "Parte IV",
    titulo: "Formulas, tabuladores y escalamiento",
    descripcion:
      "Reglas matematicas de apartado, venta, compra, consignacion, PLD y garantia. El motor calcula desde los datos fuente; el capturista no sustituye el resultado.",
    fuentes: [{ documento: "M-01 Rev. 3.0", referencia: "pp. 37-40" }],
    aviso: {
      tipo: "info",
      titulo: "Orden de datos para C-01",
      texto:
        "Captura primero monto del apartado (A) y precio total pactado (OP). DMS aplica la politica contractual vigente de 50% y calcula P = min((p / 100) x A, OP), seguida de R = A - P.",
    },
    secciones: [
      {
        id: "apartado",
        titulo: "Apartado y pena espejo",
        parrafos: [
          "M-01 publica la formula de pena de apartado P = min((p / 100) x A, OP) y el remanente R = A - P. La configuracion productiva de DMS aplica p = 50 por politica contractual, sin campo editable para sustituirla.",
          "Para el desistimiento atribuible al proveedor, M-01 contempla la pena espejo D = A + ((p / 100) x A). La aplicacion de una exencion o de un caso fuera de la regla requiere el proceso y autorizacion correspondientes.",
        ],
      },
      {
        id: "otras-formulas",
        titulo: "Venta, compra y consignacion",
        parrafos: [
          "Las formulas publicadas en M-01 incluyen C-02: P = min(0.15 x P_contado, OP); C-03: P = min(0.10 x P_total, OP); y consignacion: L = Pv - Rt - G.",
          "Para consignacion se documentan tambien Rt como porcentaje o importe fijo, Mret = 0.03 x Vm x d / 30 y Alm = 0.02 x Vm x d / 30. Usa las variables del contrato y el tabulador fuente; no cambies la base para forzar un resultado.",
        ],
      },
      {
        id: "pld-y-garantia",
        titulo: "PLD y garantia",
        parrafos: [
          "La tabla de M-01 usa UMA 2026 de $117.31 y muestra los umbrales Uid = 3,210 UMA y Uav = 6,420 UMA. Los montos que se acerquen a los umbrales requieren el control y evidencia indicados por el manual.",
          "La garantia se comprueba contra el plazo y kilometraje pactados: t no puede exceder tmax y km no puede exceder kmmax. La captura debe usar valores documentados en el contrato, no estimaciones.",
        ],
      },
      {
        id: "tabulador-y-escalamiento",
        titulo: "Tabulador y escalamiento",
        parrafos: [
          "El tabulador calcula; no decide si una pena procede ni reemplaza la autorizacion. Ante datos incompletos, causa no contemplada, diferencia en el contrato o resultado que parezca inusual, conserva la evidencia y escala antes de registrar el cierre.",
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
      "Como leer M-02 junto con M-01 para documentar penalizaciones, desistimientos y cancelaciones sin alterar las formulas fuente.",
    fuentes: [{ documento: "M-02 v1.0", referencia: "Parte I" }],
    aviso: {
      tipo: "warning",
      titulo: "M-02 es complementario",
      texto:
        "M-02 no sustituye ni modifica las formulas, tabuladores o glosario de M-01. Para calculos, la fuente sigue siendo M-01 Parte IV y la politica contractual vigente en DMS.",
    },
    secciones: [
      {
        id: "que-aporta",
        titulo: "Que aporta el anexo",
        parrafos: [
          "El anexo reune el fundamento normativo, autorizaciones, documentacion trazable y casos borde que M-01 distribuye entre contratos y procesos. Se consulta en conjunto con el contrato concreto y con los documentos del expediente.",
        ],
        puntos: [
          "Identifica la norma y articulo citado por el anexo.",
          "Distingue la regla legal de una politica interna del lote.",
          "Relaciona la decision con el contrato, formato y formula de M-01 que la ejecutan.",
        ],
      },
      {
        id: "alcance-operativo",
        titulo: "Alcance operativo",
        parrafos: [
          "Aplica a cancelacion, desistimiento o terminacion anticipada de C-01, C-02, C-03 y C-04. El operador clasifica el caso con evidencia; no usa una causa para evitar una penalizacion ni impone una pena cuando la causa documentada la excluye.",
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
      "Fuentes que M-02 cita para contextualizar penas convencionales, proteccion al consumidor, consignacion y devoluciones.",
    fuentes: [{ documento: "M-02 v1.0", referencia: "Parte II" }],
    aviso: {
      tipo: "warning",
      titulo: "Referencia documental, no dictamen",
      texto:
        "La vigencia y aplicacion juridica deben validarse antes de modificar contratos, crear formatos o resolver una excepcion. Esta pantalla no sustituye la revision legal externa indicada por M-02.",
    },
    secciones: [
      {
        id: "fuentes",
        titulo: "Fuentes citadas por M-02",
        parrafos: [
          "M-02 ordena la consulta desde la NOM-122-SCFI-2010, la Ley Federal de Proteccion al Consumidor, el Codigo de Comercio y el Codigo Civil Federal como derecho supletorio que el anexo describe.",
        ],
        puntos: [
          "NOM-122-SCFI-2010: practicas comerciales de vehiculos usados y consignacion.",
          "LFPC: proteccion al consumidor y limites de clausulas contractuales.",
          "Codigo de Comercio: terminacion y liquidacion en consignacion.",
          "Codigo Civil Federal: teoria general de la clausula penal, segun el anexo.",
        ],
      },
      {
        id: "apartado-no-arras",
        titulo: "Apartado y referencia a arras",
        parrafos: [
          "M-02 advierte que el C-01 no debe explicarse como arras civiles. El anexo lo trata como un contrato de adhesion regulado por la NOM-122 y la clausula penal aplicable, con la documentacion y formula de M-01.",
        ],
      },
      {
        id: "devoluciones",
        titulo: "Devoluciones y trazabilidad",
        parrafos: [
          "El anexo indica que una devolucion conserva controles de trazabilidad y PLD. El medio de devolucion, los montos acumulados y la evidencia deben revisarse con el expediente y las reglas vigentes antes de pagar.",
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
      "Criterio de clasificacion para no aplicar la formula o clausula equivocada cuando el cliente ya firmo una venta.",
    fuentes: [{ documento: "M-02 v1.0", referencia: "Parte III" }],
    secciones: [
      {
        id: "criterio",
        titulo: "El documento firmado define la operacion",
        parrafos: [
          "M-02 fija que la caracterizacion no depende de lo que alguien recuerde haber dicho. Si solo existe C-01, el monto se trata como apartado. Si ya existe C-02, cualquier entrega es parte del precio pactado en ese contrato y sigue sus propias clausulas.",
        ],
      },
      {
        id: "captura",
        titulo: "Regla para captura y cierre",
        parrafos: [
          "Antes de calcular o registrar una cancelacion, confirma que contrato se firmo y adjunta el comprobante de pago que acredita el monto efectivamente entregado. Una etiqueta incorrecta altera la formula, autorizacion y devolucion aplicables.",
        ],
      },
    ],
  },
  {
    slug: "m02-pena-convencional",
    manual: "M-02",
    parte: "Parte IV",
    titulo: "Pena convencional: limites y validez",
    descripcion:
      "Controles previos para que una clausula o su aplicacion no contradigan los limites que M-02 identifica.",
    fuentes: [{ documento: "M-02 v1.0", referencia: "Parte IV" }],
    secciones: [
      {
        id: "limites",
        titulo: "Limites de la clausula",
        parrafos: [
          "M-02 remite a los supuestos del articulo 90 de la LFPC y exige revisar que la clausula no permita modificaciones unilaterales, liberacion indebida del proveedor, traslado de responsabilidad, formalidades improcedentes o renuncias a proteccion aplicable.",
        ],
      },
      {
        id: "formula-fuente",
        titulo: "La formula no se duplica ni se altera",
        parrafos: [
          "El anexo remite expresamente a M-01 Parte IV y al tabulador fuente para PC01, D, PC02, PC03, L, Mret y Alm. En DMS, los campos fuente y el motor de datos determinan el resultado; no hay una edicion manual de la pena calculada.",
        ],
      },
    ],
  },
  {
    slug: "m02-matriz-de-aplicacion",
    manual: "M-02",
    parte: "Parte V",
    titulo: "Matriz de aplicacion por operacion y causa",
    descripcion:
      "Marco para cruzar contrato, quien origina la terminacion, causa acreditada y tratamiento documentable.",
    fuentes: [{ documento: "M-02 v1.0", referencia: "Parte V" }],
    secciones: [
      {
        id: "clasificacion",
        titulo: "Clasifica antes de calcular",
        parrafos: [
          "La matriz cubre C-01, C-02, C-03 y C-04. Antes de usar una formula, identifica el contrato firmado, quien solicita o causa la terminacion, la evidencia y si la causa es ordinaria, incumplimiento, exencion o una alerta que impide continuar.",
        ],
      },
      {
        id: "regla-operativa",
        titulo: "Regla operativa",
        parrafos: [
          "El calculo no decide la causa ni la autorizacion. Si los datos no sustentan la fila de la matriz, la operacion queda pendiente de evidencia y escalamiento; no se registra una causa aproximada solo para obtener un importe.",
        ],
      },
    ],
  },
  {
    slug: "m02-procedimiento",
    manual: "M-02",
    parte: "Parte VI",
    titulo: "Procedimiento de cancelacion y desistimiento",
    descripcion:
      "Secuencia de control aplicable a C-01, C-02, C-03 y C-04 cuando se solicita una cancelacion o terminacion anticipada.",
    fuentes: [{ documento: "M-02 v1.0", referencia: "Parte VI" }],
    secciones: [
      {
        id: "secuencia",
        titulo: "Secuencia obligatoria",
        parrafos: [
          "La solicitud se atiende contra el expediente y el contrato firmado. El resultado debe dejar la causa, importes fuente, formula aplicada o razon de exencion, aprobacion requerida y evidencia de devolucion o liquidacion.",
        ],
        pasos: [
          "Identifica el contrato y recupera su expediente, comprobantes de pago y anexos relevantes.",
          "Clasifica la causa con evidencia y determina si es pena, exencion, incumplimiento o alerta de cumplimiento.",
          "Calcula desde los datos fuente que correspondan al contrato; verifica el tope y la politica aplicable.",
          "Obtiene la autorizacion del nivel que marque la matriz cuando no sea un caso ordinario.",
          "Documenta el cierre, medio de pago o devolucion y conserva comprobantes trazables en el expediente.",
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
      "Escenarios que no deben resolverse con una pena automatica sin revisar la causa, la evidencia y el contrato aplicable.",
    fuentes: [{ documento: "M-02 v1.0", referencia: "Parte VII" }],
    aviso: {
      tipo: "warning",
      titulo: "No fuerces un caso borde",
      texto:
        "Estos escenarios requieren clasificacion documentada. Cuando falte evidencia, haya copropiedad, pagos parciales o una alerta de cumplimiento, detente y escala antes de calcular o devolver.",
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
          "Para caso fortuito o fuerza mayor, M-02 pide evidencia razonable, documentacion por N2/N3 y reprogramacion o devolucion sin pena. Si C-03 se detiene por reporte de robo en REPUVE antes de pago, lo trata como candado de pago condicionado, no como desistimiento penalizable.",
        ],
      },
      {
        id: "consignacion-y-devolucion",
        titulo: "Consignacion y medio de devolucion",
        parrafos: [
          "M-02 separa terminacion ordinaria de C-04 de un incumplimiento grave para efectos de liquidacion y moras. Tambien indica conservar trazabilidad del medio de devolucion y revisar controles PLD antes de cambiarlo.",
        ],
      },
      {
        id: "copropiedad-y-pago-parcial",
        titulo: "Copropiedad y pago parcial",
        parrafos: [
          "En copropiedad, M-02 exige identificar y documentar el consentimiento de todos los interesados que resulten obligados. Para pagos parciales, indica usar el monto efectivamente entregado y pactado como base; ante una reduccion no exacta, recomienda criterio conservador y consulta antes de aplicar el maximo.",
        ],
      },
    ],
  },
  {
    slug: "m02-f12-propuesto",
    manual: "M-02",
    parte: "Parte VIII",
    titulo: "F-12 propuesto: acta de cancelacion",
    descripcion:
      "Alcance del formato propuesto por M-02 para dejar evidencia de una pena aplicada o exenta.",
    fuentes: [{ documento: "M-02 v1.0", referencia: "Parte VIII" }],
    aviso: {
      tipo: "warning",
      titulo: "No disponible para operacion",
      texto:
        "F-12 es una propuesta de M-02. No figura como formato operativo descargable de DMS ni modifica el indice M-01 hasta su revision formal por Operaciones y validacion legal externa.",
    },
    secciones: [
      {
        id: "objetivo",
        titulo: "Objetivo propuesto",
        parrafos: [
          "M-02 propone F-12 como acta de cancelacion y aplicacion de pena convencional para documentar tanto la aplicacion como la exencion, incluso cuando el resultado sea cero. No sustituye C-01, C-02, C-03 ni C-04.",
        ],
      },
      {
        id: "estado",
        titulo: "Estado en DMS",
        parrafos: [
          "Hasta que exista aprobacion documentada, el equipo debe seguir los contratos, formatos y controles actualmente habilitados. No se debe crear un expediente paralelo ni imprimir un F-12 como si estuviera aprobado solo por aparecer en este anexo.",
        ],
      },
    ],
  },
  {
    slug: "m02-tabulador-recomendado",
    manual: "M-02",
    parte: "Parte IX",
    titulo: "Recomendacion para tabuladores",
    descripcion:
      "Mejoras propuestas al tabulador sin modificar las formulas fuente ni reemplazar el criterio de autorizacion.",
    fuentes: [{ documento: "M-02 v1.0", referencia: "Parte IX" }],
    secciones: [
      {
        id: "recomendaciones",
        titulo: "Controles propuestos",
        parrafos: [
          "M-02 recomienda una hoja CANCELACIONES que replique las formulas de M-01, capture la causa mediante catalogo cerrado y muestre por que una causa exenta produce cero. Tambien recomienda una alerta cuando el resultado exceda la base permitida.",
        ],
      },
      {
        id: "limite",
        titulo: "Limite del tabulador",
        parrafos: [
          "El tabulador calcula, pero no decide. La causa, exencion y autorizacion siguen la matriz y procedimiento del anexo. La implementacion productiva se hace en el motor de datos y debe conservar los importes fuente y la regla aplicada.",
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
      "Alcance temporal del anexo y regla de validacion antes de convertir una recomendacion en operacion o cambio contractual.",
    fuentes: [{ documento: "M-02 v1.0", referencia: "Parte X" }],
    aviso: {
      tipo: "warning",
      titulo: "Revisar antes de operar cambios",
      texto:
        "M-02 advierte que las leyes y normas citadas pueden cambiar. Antes de modificar un contrato, una clausula o un formato propuesto, se requiere la validacion legal externa que el propio anexo indica.",
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
          "Los cambios de contratos, formatos, formulas y politicas deben pasar por el flujo formal de validacion. La documentacion ayuda a detectar lo que debe cambiar; no es por si misma una autorizacion para cambiarlo.",
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
      name: "Inicio de documentacion",
      url: "/documentacion",
    },
    {
      type: "folder",
      name: "M-01 · Libro de consulta",
      defaultOpen: true,
      children: MANUALES.filter((manual) => manual.manual === "M-01").map((manual) => ({
        type: "page" as const,
        name: `${manual.parte} · ${manual.titulo}`,
        url: `/documentacion/${manual.slug}`,
      })),
    },
    {
      type: "folder",
      name: "M-02 · Anexo de cancelaciones",
      defaultOpen: true,
      children: MANUALES.filter((manual) => manual.manual === "M-02").map((manual) => ({
        type: "page" as const,
        name: `${manual.parte} · ${manual.titulo}`,
        url: `/documentacion/${manual.slug}`,
      })),
    },
  ],
};

export function manualPorSlug(slug: string) {
  return MANUALES.find((manual) => manual.slug === slug);
}

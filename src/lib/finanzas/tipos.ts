/**
 * Vocabulario compartido del módulo de Finanzas (CACM-RCI-01..07).
 *
 * Este archivo NO lleva `server-only`: la pantalla que captura un recibo tiene
 * que hablar de los mismos estados, roles e importes que el servicio que lo
 * guarda. Aquí sólo viven tipos y esquemas de forma —ninguna consulta, ningún
 * secreto—, así que puede viajar al cliente sin riesgo.
 *
 * La AUTORIDAD de todo lo que se declara aquí es el esquema `traza`
 * (migraciones 034 a 037). Lo que se repite en TypeScript se repite para poder
 * dibujar y validar ANTES de ir a la base, nunca para decidir en lugar de
 * ella: los candados del manual se imponen en plpgsql y llegan como P0001.
 */

import { z } from "zod";

import { aCentavos, deCentavos } from "@/lib/finanzas/calculos";
import { LONGITUD_VIN, vinEsValido } from "@/lib/finanzas/formato";

// ===== FORMATOS =====

/** Los siete formatos de control interno de efectivo. */
export const TIPOS_RCI = [
  "CACM-RCI-01",
  "CACM-RCI-02",
  "CACM-RCI-03",
  "CACM-RCI-04",
  "CACM-RCI-05",
  "CACM-RCI-06",
  "CACM-RCI-07",
] as const;

export type TipoRci = (typeof TIPOS_RCI)[number];

/**
 * Nombre corto de cada formato, para poblar un selector sin ir a la base. El
 * nombre oficial y la revisión vigente los devuelve `v_documento_financiero`
 * (columnas `nombre_tipo` y `revision`) y son los que deben imprimirse.
 */
export const ETIQUETA_TIPO_RCI: Record<TipoRci, string> = {
  "CACM-RCI-01": "Recibo de Caja Interno",
  "CACM-RCI-02": "Ingreso de Vehículo a Inventario",
  "CACM-RCI-03": "Liquidación de Venta en Consignación",
  "CACM-RCI-04": "Recibo de Ingreso por Servicio",
  "CACM-RCI-05": "Vale de Egreso de Caja",
  "CACM-RCI-06": "Recibo de Pago de Nómina",
  "CACM-RCI-07": "Corte de Caja Diario",
};

// ===== ESTADOS =====

/**
 * borrador -> pendiente de firma -> firmado (inmutable). Los dos primeros
 * pueden terminar en cancelado; firmado no. Las transiciones válidas viven en
 * `traza.transicion_documento_financiero`: no se replican aquí para que no
 * exista una segunda opinión sobre qué movimiento se permite.
 */
export const ESTADOS_DOCUMENTO_FINANCIERO = [
  "BORRADOR",
  "PENDIENTE_DE_FIRMA",
  "FIRMADO",
  "CANCELADO",
] as const;

export type EstadoDocumentoFinanciero = (typeof ESTADOS_DOCUMENTO_FINANCIERO)[number];

export const ETIQUETA_ESTADO_DOCUMENTO: Record<EstadoDocumentoFinanciero, string> = {
  BORRADOR: "Borrador",
  PENDIENTE_DE_FIRMA: "Pendiente de firma",
  FIRMADO: "Firmado",
  CANCELADO: "Cancelado",
};

// ===== ROLES FIRMANTES =====

export const ROLES_FIRMANTE = [
  "ENTREGO_VENDEDOR",
  "ENTREGO_ASESOR",
  "RECIBIO_CUSTODIO",
  "ENTREGO_PROPIETARIO",
  "RECIBIO_INVENTARIO",
  "CONSIGNANTE_RECIBE",
  "CUSTODIO_CALCULO",
  "AUTORIZO_GERENTE",
  "ENTREGO_CUSTODIO",
  "RECIBIO_BENEFICIARIO",
  "RECIBIO_TRABAJADOR",
  "ENTREGO_RH",
  "ELABORO_CUSTODIO",
  "REVISO_GERENTE",
  "ENTERADO_SOCIO",
  "TESTIGO",
] as const;

export type RolFirmante = (typeof ROLES_FIRMANTE)[number];

export type FichaRolFirmante = {
  etiqueta: string;
  /**
   * Verdadero cuando quien firma es personal de la empresa y rubrica con su
   * usuario y su PIN. Falso cuando es un tercero —consignante, trabajador,
   * beneficiario de un pago— que no tiene ni debe tener cuenta: su firma se
   * levanta de forma presencial y la atestigua un usuario interno.
   */
  exigeUsuarioInterno: boolean;
};

/**
 * Copia de `traza.rol_firmante` para decidir en pantalla QUÉ formulario de
 * firma mostrar (PIN propio contra identificación y testigo) sin un viaje
 * previo a la base. Si las dos versiones se separaran, manda la base:
 * `firmar_documento_externo` rechaza un rol que exige usuario interno y
 * `firmar_documento_financiero` no admite terceros.
 *
 * Qué roles pide CADA formato no se copia aquí a propósito: eso vive en
 * `firma_requerida` y lo devuelve `firmasPendientes()`, de modo que sumar un
 * firmante a un formato sea un renglón de datos y no un despliegue.
 */
export const CATALOGO_ROL_FIRMANTE: Record<RolFirmante, FichaRolFirmante> = {
  ENTREGO_VENDEDOR: { etiqueta: "Entregó — Vendedor", exigeUsuarioInterno: true },
  ENTREGO_ASESOR: { etiqueta: "Entregó — Asesor / Cajero de servicio", exigeUsuarioInterno: true },
  RECIBIO_CUSTODIO: { etiqueta: "Recibió — Custodio Financiero", exigeUsuarioInterno: true },
  ENTREGO_PROPIETARIO: { etiqueta: "Entregó — Propietario / Consignante", exigeUsuarioInterno: false },
  RECIBIO_INVENTARIO: { etiqueta: "Recibió — Responsable de inventario", exigeUsuarioInterno: true },
  CONSIGNANTE_RECIBE: { etiqueta: "Consignante — Recibe liquidación", exigeUsuarioInterno: false },
  CUSTODIO_CALCULO: { etiqueta: "Custodio Financiero — Cálculo y entregó", exigeUsuarioInterno: true },
  AUTORIZO_GERENTE: { etiqueta: "Autorizó — Gerente General / Socio", exigeUsuarioInterno: true },
  ENTREGO_CUSTODIO: { etiqueta: "Entregó — Custodio Financiero", exigeUsuarioInterno: true },
  RECIBIO_BENEFICIARIO: { etiqueta: "Recibió — Beneficiario del pago", exigeUsuarioInterno: false },
  RECIBIO_TRABAJADOR: { etiqueta: "Recibí conforme — Trabajador", exigeUsuarioInterno: false },
  ENTREGO_RH: { etiqueta: "Entregó — Custodio Financiero / RH", exigeUsuarioInterno: true },
  ELABORO_CUSTODIO: { etiqueta: "Elaboró — Custodio Financiero", exigeUsuarioInterno: true },
  REVISO_GERENTE: { etiqueta: "Revisó y autorizó — Gerente General", exigeUsuarioInterno: true },
  ENTERADO_SOCIO: { etiqueta: "Socio / Propietario — Enterado", exigeUsuarioInterno: true },
  TESTIGO: { etiqueta: "Testigo", exigeUsuarioInterno: false },
};

/** Roles que firman con usuario y PIN propios. */
export const ROLES_FIRMANTE_INTERNOS: readonly RolFirmante[] = ROLES_FIRMANTE.filter(
  (rol) => CATALOGO_ROL_FIRMANTE[rol].exigeUsuarioInterno,
);

/** Roles que firman de forma presencial, atestiguados por un usuario interno. */
export const ROLES_FIRMANTE_EXTERNOS: readonly RolFirmante[] = ROLES_FIRMANTE.filter(
  (rol) => !CATALOGO_ROL_FIRMANTE[rol].exigeUsuarioInterno,
);

export function rolExigeUsuarioInterno(rol: RolFirmante): boolean {
  return CATALOGO_ROL_FIRMANTE[rol].exigeUsuarioInterno;
}

export const METODOS_FIRMA = ["PIN_USUARIO", "AUTOGRAFA_PRESENCIAL"] as const;
export type MetodoFirma = (typeof METODOS_FIRMA)[number];

// ===== SELLOS =====

export const ACCIONES_SELLABLES = [
  "FOLIO_EMITIDO",
  "ENTREGA_DECLARADA",
  "CUSTODIA_CONFIRMADA",
  "AUTORIZADO",
  "PAGO_ENTREGADO",
  "RECIBIDO_CONFORME",
  "INVENTARIO_RECIBIDO",
  "LIQUIDADO",
  "TESTIGO_PRESENCIAL",
  "DOCUMENTO_FIRMADO",
  "CORTE_CERRADO",
  "FOLIO_CANCELADO",
  "COMPLEMENTADO",
] as const;

export type AccionSellable = (typeof ACCIONES_SELLABLES)[number];
export type FormaSello = "CIRCULAR" | "RECTANGULAR";
export type ColorSello = "AZUL" | "ROJO" | "NEGRO" | "VERDE";

/**
 * Lo que devuelve `v_sello_verificacion` al teclear un token: acredita el
 * hecho sin exponer importes ni datos personales de quien sólo verifica.
 */
export type SelloVerificacion = {
  token: string;
  accion: AccionSellable;
  leyenda: string;
  forma: FormaSello;
  color: ColorSello;
  rol: RolFirmante | null;
  rolEtiqueta: string | null;
  folio: string;
  folioCompleto: string;
  tipoCodigo: TipoRci;
  nombreTipo: string;
  sucursalClave: string;
  estadoDocumento: EstadoDocumentoFinanciero | null;
  estampadoPorNombre: string;
  estampadoEn: string;
  hashContenido: string;
};

// ===== SUCURSAL Y PERSONAL =====

export type Sucursal = {
  id: number;
  clave: string;
  nombre: string;
  activa: boolean;
  /**
   * Zona con la que se decide a qué día pertenece un cobro de esta agencia.
   * Es la del cajón, no la del servidor: la frontera del corte depende de
   * dónde está el dinero, no de dónde corre el proceso.
   */
  zonaHoraria: string;
};

/**
 * Categorías del CHECK de `persona.categoria`. Se enumeran —a diferencia de
 * los conceptos de cobro o de egreso, que son catálogos administrables— porque
 * el CHECK las cierra: agregar una es una migración, no un renglón de datos.
 *
 * Es una PISTA para filtrar el selector, no una verdad jurídica: alguien puede
 * estar dado de alta como PROVEEDOR y ser además socio, y el sistema debe
 * seguir tratándolo como socio. Quién es socio lo dice la tabla `socio` y sólo
 * ella.
 */
export const CATEGORIAS_PERSONA = [
  "PROVEEDOR",
  "EMPLEADO",
  "SOCIO",
  "CLIENTE",
  "OTRO",
] as const;

export type CategoriaPersona = (typeof CATEGORIAS_PERSONA)[number];

export const ETIQUETA_CATEGORIA_PERSONA: Record<CategoriaPersona, string> = {
  PROVEEDOR: "Proveedor",
  EMPLEADO: "Empleado",
  SOCIO: "Socio",
  CLIENTE: "Cliente",
  OTRO: "Otro",
};

export const esquemaCategoriaPersona = z.enum(CATEGORIAS_PERSONA);

/**
 * El trabajador que cobra un recibo de nómina no es forzosamente un usuario
 * del sistema: `usuarioId` sólo existe cuando esa persona además opera la
 * aplicación.
 */
export type Empleado = {
  id: number;
  numEmpleado: string;
  /** Nombre o nombres de pila. */
  nombres: string;
  apellidoPaterno: string;
  /** Opcional: no todo el mundo lleva dos apellidos. */
  apellidoMaterno: string | null;
  /**
   * Nombre completo. Es columna DERIVADA en la base, no capturada: así no
   * puede existir un nombre impreso que contradiga a sus apellidos. Se manda a
   * la pantalla ya armado para que nadie lo vuelva a concatenar por su cuenta.
   */
  nombre: string;
  departamento: string | null;
  puesto: string | null;
  sucursalId: number;
  usuarioId: number | null;
  activo: boolean;
  /**
   * Cuándo se inhabilitó. Dar de baja NO borra: el vendedor que renunció sigue
   * citado por su nombre en cada recibo que cobró, y esos folios tienen que
   * poder leerse años después. Lo único que cambia es que deja de ofrecerse en
   * una captura nueva.
   */
  bajaEn: string | null;
};

// ===== DOCUMENTO FINANCIERO =====

/**
 * Reflejo de `v_documento_financiero`, con los identificadores ya en número y
 * las horas en ISO 8601.
 *
 * `folio` es lo que se imprime en la forma (CACM-RCI-01-0001); como el
 * consecutivo corre por sucursal, para citarlo entre agencias se usa
 * `folioCompleto`.
 */
export type DocumentoFinanciero = {
  id: number;
  folio: string;
  folioCompleto: string;
  tipoCodigo: TipoRci;
  nombreTipo: string;
  revision: string;
  sucursalId: number;
  sucursalClave: string;
  sucursalNombre: string;
  consecutivo: number;
  /**
   * Nulo sólo si el folio no tuviera historial de estado. La vista lo trae con
   * LEFT JOIN y `emitir_folio_financiero` siempre asienta BORRADOR, así que en
   * la práctica no ocurre; se declara nulo para no mentir sobre la vista.
   */
  estado: EstadoDocumentoFinanciero | null;
  estadoDesde: string | null;
  /** Explicación con la que se canceló el folio. */
  estadoMotivo: string | null;
  /** Folio firmado que este documento corrige, sin tachaduras. */
  complementaA: number | null;
  /** Folio posterior que corrige a éste. */
  complementadoPor: number | null;
  creadoPor: number;
  creadoEn: string;
};

// ===== FIRMAS =====

export type FirmaDocumento = {
  documentoId: number;
  rol: RolFirmante;
  rolEtiqueta: string;
  metodo: MetodoFirma;
  /** Firmante interno. Nulo en una firma presencial de un tercero. */
  usuarioId: number | null;
  usuarioNombre: string | null;
  /** Datos del tercero. Nulos cuando firmó un usuario interno con su PIN. */
  firmanteNombre: string | null;
  firmanteIdTipo: string | null;
  firmanteIdNumero: string | null;
  /** Usuario interno que responde por la firma presencial que atestiguó. */
  atestiguadoPor: number | null;
  atestiguadoPorNombre: string | null;
  trazoRuta: string | null;
  firmadoEn: string;
  /** Huella del contenido tal como estaba al firmarse. */
  hashContenido: string;
  origenSesion: string | null;
};

/** Renglón de `firma_requerida` que este documento todavía no cubre. */
export type FirmaPendiente = {
  rol: RolFirmante;
  etiqueta: string;
  /** Si es falsa, su ausencia no impide que el documento se cierre. */
  obligatoria: boolean;
  /** Orden en que las firmas aparecen en la forma impresa. */
  orden: number;
  exigeUsuarioInterno: boolean;
};

// ===== ESQUEMAS REUTILIZABLES =====

/** Identificador de fila: bigint del lado de Postgres, entero seguro aquí. */
export const esquemaId = z
  .number()
  .int("El identificador debe ser un número entero")
  .positive("El identificador debe ser un número positivo")
  .max(Number.MAX_SAFE_INTEGER);

export const esquemaTipoRci = z.enum(TIPOS_RCI);
export const esquemaEstadoDocumento = z.enum(ESTADOS_DOCUMENTO_FINANCIERO);
export const esquemaRolFirmante = z.enum(ROLES_FIRMANTE);

/**
 * numeric(18,2): dieciséis dígitos enteros y dos decimales. Se acepta el
 * separador de millares porque quien captura copia del papel.
 */
const PATRON_IMPORTE = /^-?\d{1,16}(?:\.\d{1,2})?$/;

const MENSAJE_FORMATO_IMPORTE =
  "El importe se escribe con dígitos y hasta dos decimales, por ejemplo 12345.67";

/**
 * El dinero viaja como cadena de principio a fin: `numeric(18,2)` admite
 * cifras que un `number` de JavaScript ya redondea mal, y un centavo perdido
 * en un recibo es una diferencia de caja que alguien tiene que explicar. La
 * comparación se hace en centavos enteros con `aCentavos`.
 */
function esquemaImporte(esValido: (centavos: bigint) => boolean, mensaje: string) {
  return z
    .string()
    .trim()
    .transform((valor) => valor.replace(/,/g, ""))
    .refine((valor) => PATRON_IMPORTE.test(valor), MENSAJE_FORMATO_IMPORTE)
    .refine((valor) => {
      const centavos = aCentavos(valor);
      return centavos !== null && esValido(centavos);
    }, mensaje)
    // Canoniza a la forma exacta de la columna: "1234.5" y "1,234.50" salen
    // ambos como "1234.50", así que el hash de contenido no cambia por la
    // manera en que se tecleó la cifra.
    .transform((valor) => deCentavos(aCentavos(valor) as bigint));
}

/** Importe estrictamente positivo: lo que cobra o paga un formato. */
export const esquemaImporteMonetario = esquemaImporte(
  (centavos) => centavos > 0n,
  "El importe debe ser mayor que cero",
);

/** Importe que sí admite el cero (percepciones, deducciones, saldos). */
export const esquemaImporteNoNegativo = esquemaImporte(
  (centavos) => centavos >= 0n,
  "El importe no puede ser negativo",
);

/**
 * Importe con signo y distinto de cero: sólo el ajuste de utilidad del RCI-03,
 * que puede corregir hacia arriba o hacia abajo pero nunca ser un no-cambio.
 */
export const esquemaImporteConSigno = esquemaImporte(
  (centavos) => centavos !== 0n,
  "El ajuste debe ser distinto de cero",
);

/** VIN de 17 caracteres. No usa I, O ni Q para no confundirlas con 1 y 0. */
export const esquemaVin = z
  .string()
  .transform((valor) => valor.trim().toUpperCase())
  .refine(
    vinEsValido,
    `El VIN debe tener ${LONGITUD_VIN} caracteres y no admite las letras I, O ni Q`,
  );

/**
 * PIN de firma. Mismo rango que exige `establecer_pin_firma`. Nunca se
 * registra en bitácora ni se guarda en claro: sólo viaja como parámetro
 * enlazado hacia la función que lo coteja contra su hash bcrypt.
 */
export const esquemaPinFirma = z
  .string()
  .trim()
  .regex(/^[0-9]{6,12}$/, "El PIN de firma debe tener entre 6 y 12 dígitos");

/**
 * Huella sha256 del contenido firmado. La base la guarda en minúsculas
 * (`char(64)` con CHECK), así que aquí se normaliza en lugar de rechazar una
 * mayúscula que sólo es una diferencia de escritura.
 */
export const esquemaHashSha256 = z
  .string()
  .transform((valor) => valor.trim().toLowerCase())
  .refine(
    (valor) => /^[0-9a-f]{64}$/.test(valor),
    "La huella del contenido debe ser un sha256 de 64 caracteres hexadecimales",
  );

/** Identificación oficial con la que un tercero acredita quién es. */
export const esquemaIdentificacion = z.object({
  tipo: z
    .string()
    .trim()
    .min(2, "Indica el tipo de identificación (INE, pasaporte, licencia…)")
    .max(40),
  numero: z
    .string()
    .trim()
    .min(3, "Captura el número de la identificación")
    .max(40),
});

export type IdentificacionOficial = z.output<typeof esquemaIdentificacion>;

/** Nombre de una persona tal como aparece en su identificación. */
export const esquemaNombrePersona = z
  .string()
  .trim()
  .min(3, "El nombre debe tener al menos 3 caracteres")
  .max(200);

export const esquemaClaveSucursal = z
  .string()
  .transform((valor) => valor.trim().toUpperCase())
  .refine(
    (valor) => /^[A-Z0-9]{2,8}$/.test(valor),
    "La clave de sucursal son de 2 a 8 letras o dígitos en mayúscula",
  );

function esFechaCalendarioValida(valor: string): boolean {
  const [anio, mes, dia] = valor.split("-").map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return (
    fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia
  );
}

/** Fecha civil AAAA-MM-DD, para las columnas `date` (fecha de corte, período). */
export const esquemaFechaIso = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha se escribe como AAAA-MM-DD")
  .refine(esFechaCalendarioValida, "Esa fecha no existe en el calendario");

/**
 * Instante con huso horario explícito, para las columnas `timestamptz`
 * (hora del cobro, del pago). Se exige la Z o el desplazamiento: sin él, la
 * hora en que se recibió el dinero cambiaría según dónde corra el servidor, y
 * esa hora decide a qué corte de caja pertenece el folio.
 */
export const esquemaFechaHoraIso = z
  .string()
  .trim()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})$/,
    "La fecha y hora deben incluir su huso horario, por ejemplo 2026-07-25T14:30:00-06:00",
  )
  .refine((valor) => !Number.isNaN(Date.parse(valor)), "La fecha y hora no son válidas");

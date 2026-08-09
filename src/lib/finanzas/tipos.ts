

import { z } from "zod";

import { aCentavos, deCentavos } from "@/lib/finanzas/calculos";
import { LONGITUD_VIN, vinEsValido } from "@/lib/finanzas/formato";

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

export const ETIQUETA_TIPO_RCI: Record<TipoRci, string> = {
  "CACM-RCI-01": "Recibo de Caja Interno",
  "CACM-RCI-02": "Ingreso de Vehículo a Inventario",
  "CACM-RCI-03": "Liquidación de Venta en Consignación",
  "CACM-RCI-04": "Recibo de Ingreso por Servicio",
  "CACM-RCI-05": "Vale de Egreso de Caja",
  "CACM-RCI-06": "Recibo de Pago de Nómina",
  "CACM-RCI-07": "Corte de Caja Diario",
};

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
  
  exigeUsuarioInterno: boolean;
};

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

export const ROLES_FIRMANTE_INTERNOS: readonly RolFirmante[] = ROLES_FIRMANTE.filter(
  (rol) => CATALOGO_ROL_FIRMANTE[rol].exigeUsuarioInterno,
);

export const ROLES_FIRMANTE_EXTERNOS: readonly RolFirmante[] = ROLES_FIRMANTE.filter(
  (rol) => !CATALOGO_ROL_FIRMANTE[rol].exigeUsuarioInterno,
);

export function rolExigeUsuarioInterno(rol: RolFirmante): boolean {
  return CATALOGO_ROL_FIRMANTE[rol].exigeUsuarioInterno;
}

export const METODOS_FIRMA = ["PIN_USUARIO", "AUTOGRAFA_PRESENCIAL"] as const;
export type MetodoFirma = (typeof METODOS_FIRMA)[number];

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

export type Sucursal = {
  id: number;
  clave: string;
  nombre: string;
  activa: boolean;
  
  zonaHoraria: string;
};

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

export type Empleado = {
  id: number;
  numEmpleado: string;
  
  nombres: string;
  apellidoPaterno: string;
  
  apellidoMaterno: string | null;
  
  nombre: string;
  departamento: string | null;
  puesto: string | null;
  sucursalId: number;
  usuarioId: number | null;
  activo: boolean;
  
  bajaEn: string | null;
};

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
  
  estado: EstadoDocumentoFinanciero | null;
  estadoDesde: string | null;
  
  estadoMotivo: string | null;
  
  complementaA: number | null;
  
  complementadoPor: number | null;
  creadoPor: number;
  creadoEn: string;
};

export type FirmaDocumento = {
  documentoId: number;
  rol: RolFirmante;
  rolEtiqueta: string;
  metodo: MetodoFirma;
  
  usuarioId: number | null;
  usuarioNombre: string | null;
  
  firmanteNombre: string | null;
  firmanteIdTipo: string | null;
  firmanteIdNumero: string | null;
  
  atestiguadoPor: number | null;
  atestiguadoPorNombre: string | null;
  trazoRuta: string | null;
  firmadoEn: string;
  
  hashContenido: string;
  origenSesion: string | null;
};

export type FirmaPendiente = {
  rol: RolFirmante;
  etiqueta: string;
  
  obligatoria: boolean;
  
  orden: number;
  exigeUsuarioInterno: boolean;
};

export const esquemaId = z
  .number()
  .int("El identificador debe ser un número entero")
  .positive("El identificador debe ser un número positivo")
  .max(Number.MAX_SAFE_INTEGER);

export const esquemaTipoRci = z.enum(TIPOS_RCI);
export const esquemaEstadoDocumento = z.enum(ESTADOS_DOCUMENTO_FINANCIERO);
export const esquemaRolFirmante = z.enum(ROLES_FIRMANTE);

const PATRON_IMPORTE = /^-?\d{1,16}(?:\.\d{1,2})?$/;

const MENSAJE_FORMATO_IMPORTE =
  "El importe se escribe con dígitos y hasta dos decimales, por ejemplo 12345.67";

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

    
    .transform((valor) => deCentavos(aCentavos(valor) as bigint));
}

export const esquemaImporteMonetario = esquemaImporte(
  (centavos) => centavos > 0n,
  "El importe debe ser mayor que cero",
);

export const esquemaImporteNoNegativo = esquemaImporte(
  (centavos) => centavos >= 0n,
  "El importe no puede ser negativo",
);

export const esquemaImporteConSigno = esquemaImporte(
  (centavos) => centavos !== 0n,
  "El ajuste debe ser distinto de cero",
);

export const esquemaVin = z
  .string()
  .transform((valor) => valor.trim().toUpperCase())
  .refine(
    vinEsValido,
    `El VIN debe tener ${LONGITUD_VIN} caracteres y no admite las letras I, O ni Q`,
  );

export const esquemaPinFirma = z
  .string()
  .trim()
  .regex(/^[0-9]{6,12}$/, "El PIN de firma debe tener entre 6 y 12 dígitos");

export const esquemaHashSha256 = z
  .string()
  .transform((valor) => valor.trim().toLowerCase())
  .refine(
    (valor) => /^[0-9a-f]{64}$/.test(valor),
    "La huella del contenido debe ser un sha256 de 64 caracteres hexadecimales",
  );

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

export const esquemaFechaIso = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha se escribe como AAAA-MM-DD")
  .refine(esFechaCalendarioValida, "Esa fecha no existe en el calendario");

export const esquemaFechaHoraIso = z
  .string()
  .trim()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})$/,
    "La fecha y hora deben incluir su huso horario, por ejemplo 2026-07-25T14:30:00-06:00",
  )
  .refine((valor) => !Number.isNaN(Date.parse(valor)), "La fecha y hora no son válidas");

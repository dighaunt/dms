import "server-only";

import { aCentavos } from "@/lib/finanzas/calculos";
import {
  conceptosCobro,
  conceptosEgreso,
  formasPago,
  listarEmpleados,
} from "@/lib/finanzas/catalogos";
import { obtenerDenominaciones, obtenerReciboCaja } from "@/lib/finanzas/cobranza";
import { detalleCorte, obtenerCorte, ubicacionEfectivo } from "@/lib/finanzas/corte";
import { firmasDe, firmasPendientes, obtenerDocumento } from "@/lib/finanzas/documentos";
import { obtenerValeEgreso } from "@/lib/finanzas/egresos";
import { casillasVin, importeEnCasillas } from "@/lib/finanzas/formato";
import {
  dibujarDocumento,
  type Bloque,
  type FirmaImpresa,
  type Opcion,
  type Parte,
  type PlantillaFormato,
  type SelloImpreso,
} from "@/lib/finanzas/pdf/plantilla";
import { sellosDe } from "@/lib/finanzas/sellos";
import {
  ETIQUETA_ESTADO_DOCUMENTO,
  type DocumentoFinanciero,
  type FirmaDocumento,
  type FirmaPendiente,
  type TipoRci,
} from "@/lib/finanzas/tipos";
import { separarMiles } from "@/lib/numeros";

/**
 * Exportación a PDF de los siete formatos CACM-RCI.
 *
 * Este archivo declara QUÉ dice cada forma —su departamento, su título, sus
 * Partes numeradas, su declaración legal literal— y de dónde salen los datos.
 * CÓMO se dibuja no está aquí: eso lo hace `plantilla.ts`, que no sabe nada de
 * recibos ni de cortes.
 *
 * Por eso sumar el RCI-02, 03, 04 o 06 es escribir su armador —una función que
 * devuelve `Parte[]` leyendo su propio servicio— y registrarlo en `ARMADORES`.
 * No hay que tocar el motor de dibujo ni la ruta.
 *
 * NADA de lo que se imprime se recalcula aquí: los importes, los totales y el
 * arqueo se leen tal como los guardó la base, porque una segunda aritmética en
 * el PDF podría no coincidir con la que se firmó y el papel dejaría de probar
 * lo mismo que el expediente.
 */

// ===== PRESENTACIÓN DE DATOS =====

/**
 * Las horas se muestran en la zona de la operación. Un cobro de las 23:30 no
 * puede aparecer como del día siguiente por dónde corra el servidor: esa hora
 * decide a qué corte de caja pertenece el folio.
 */
const ZONA = "America/Mexico_City";

const FORMATO_FECHA_HORA = new Intl.DateTimeFormat("es-MX", {
  timeZone: ZONA,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function fechaHoraImpresa(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return null;
  return `${FORMATO_FECHA_HORA.format(fecha).replace(",", "")} h`;
}

/**
 * Una fecha civil (`date`) se parte a mano y NO se convierte a Date: pasarla
 * por una zona horaria la correría un día, y la fecha de un corte de caja o de
 * un período de nómina no admite ese margen.
 */
function fechaCivilImpresa(fecha: string | null | undefined): string | null {
  if (!fecha) return null;
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha.trim());
  return partes ? `${partes[3]}/${partes[2]}/${partes[1]}` : fecha;
}

/**
 * Importe listo para imprimir. No usa `importeEnCasillas` porque aquélla
 * calcula además el importe con letra y `monedaEnLetras` rechaza los negativos;
 * la diferencia de un corte sí puede serlo, y un faltante tiene que poder
 * imprimirse.
 */
function montoImpreso(monto: string | null | undefined): string {
  if (monto === null || monto === undefined || monto.trim() === "") return "";
  const canonico = monto.trim().replace(/,/g, "");
  const partes = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(canonico);
  if (!partes) return monto;
  const [, signo, entero, decimales] = partes;
  return `${signo}$${separarMiles(entero)}.${(decimales ?? "").padEnd(2, "0")}`;
}

function identificacionImpresa(
  tipo: string | null | undefined,
  numero: string | null | undefined,
): string | null {
  if (!tipo && !numero) return null;
  return [tipo, numero].filter(Boolean).join(" ");
}

// ===== CATÁLOGOS =====

/**
 * Los catálogos se cargan sólo si el formato que se está imprimiendo los
 * necesita: un corte de caja no tiene conceptos de cobro que resolver, y hacer
 * esas consultas en todos los PDF sería trabajo tirado. Se piden con los
 * inactivos incluidos porque un folio viejo puede citar un concepto que ya se
 * dio de baja y su etiqueta tiene que seguir imprimiéndose.
 */
function catalogosPerezosos() {
  const unaVez = <T>(cargar: () => Promise<T>) => {
    let pendiente: Promise<T> | null = null;
    return () => (pendiente ??= cargar());
  };

  return {
    conceptosCobro: unaVez(() => conceptosCobro({ soloActivos: false })),
    conceptosEgreso: unaVez(() => conceptosEgreso({ soloActivos: false })),
    formasPago: unaVez(() => formasPago({ soloActivos: false })),
    empleados: unaVez(() => listarEmpleados({ soloActivos: false })),
  };
}

type Catalogos = ReturnType<typeof catalogosPerezosos>;

type RenglonCatalogo = { codigo: string; etiqueta: string };

function etiquetaDe(catalogo: RenglonCatalogo[], codigo: string | null | undefined): string | null {
  if (!codigo) return null;
  return catalogo.find((renglon) => renglon.codigo === codigo)?.etiqueta ?? codigo;
}

/**
 * Reproduce la lista de incisos del papel: todas las opciones impresas y una
 * marcada. Cuando el concepto elegido es el de "Otro", el texto capturado se
 * escribe sobre la línea, como en la forma.
 */
function opcionesDeCatalogo(
  catalogo: RenglonCatalogo[],
  codigo: string | null | undefined,
  otro: string | null | undefined,
): Opcion[] {
  return catalogo.map((renglon) => ({
    texto:
      renglon.codigo === codigo && otro ? `${renglon.etiqueta}: ${otro}` : renglon.etiqueta,
    marcada: renglon.codigo === codigo,
  }));
}

// ===== TEXTO FIJO DE CADA FORMA =====

const INSTRUCCION_MOLDE =
  "Llenar a máquina o con letra de molde, sin tachaduras ni enmendaduras. Los campos con (*) son obligatorios.";
const INSTRUCCION_MOLDE_BREVE =
  "Llenar a máquina o con letra de molde. Los campos con (*) son obligatorios.";
const AVISO_NO_CFDI = ["Documento de control interno", "No es Comprobante Fiscal Digital (CFDI)"];
const NOTA_EMPRESA = "Documento interno de Comercializadora Automotriz Cliquealo de México.";

/** Lo que no depende de la captura: sale del manual y se imprime literal. */
type TextosFormato = Omit<PlantillaFormato, "partes" | "folioExtra" | "encabezadoExtra">;

const TEXTOS: Record<TipoRci, TextosFormato> = {
  "CACM-RCI-01": {
    departamento: "Departamento de Tesorería / Control Interno",
    subtitulo:
      "ENTREGA–RECEPCIÓN DE EFECTIVO · COBRANZA POR VENTA DE VEHÍCULO (Vendedor entrega a Custodio Financiero)",
    instruccion: INSTRUCCION_MOLDE,
    avisoFiscal: AVISO_NO_CFDI,
    declaracion: {
      titulo: "Parte III – Declaración y Transferencia de Responsabilidad de Custodia",
      parrafos: [
        "El Vendedor declara, bajo protesta de decir verdad, que hace entrega física, voluntaria y completa del importe señalado en la Parte II, correspondiente íntegramente al cobro descrito en la Parte I.",
        "El Custodio Financiero declara recibir el efectivo a su entera satisfacción, sin diferencia alguna. A partir de la firma del presente recibo, el Custodio Financiero asume de manera exclusiva la guarda, custodia y responsabilidad sobre el efectivo recibido, quedando el Vendedor liberado de toda responsabilidad por cualquier extravío, faltante, robo o menoscabo posterior a este acto.",
      ],
      fundamento:
        "Fundamento: Código Civil Federal – depósito (Arts. 2516 y ss.); Código Penal Federal – abuso de confianza por disposición indebida de bien mueble cuya sola tenencia fue transmitida (Arts. 382–383); Ley Federal del Trabajo – falta de probidad como causa de rescisión sin responsabilidad para el patrón (Art. 47, fracc. II) y pérdida de la confianza en personal de manejo de fondos (Art. 185).",
    },
    notaArchivo: `${NOTA_EMPRESA} Emitir por triplicado, conservar sin alteraciones por al menos 5 años y archivar junto con el corte de caja y el CFDI de la operación.`,
  },

  "CACM-RCI-02": {
    departamento: "Departamento de Inventario / Piso de Venta",
    subtitulo: "COMPRA DIRECTA O CONSIGNACIÓN – CONTROL DE ENTRADA DE UNIDADES",
    instruccion: INSTRUCCION_MOLDE,
    avisoFiscal: AVISO_NO_CFDI,
    declaracion: {
      titulo: "Parte IV – Declaración y Resguardo",
      parrafos: [
        "Quien entrega declara ser el legítimo propietario del vehículo (o representante autorizado) y responder por cualquier vicio oculto o gravamen no declarado.",
        "Si la operación es de compra directa, la propiedad se transmite a la empresa desde este acto. Si es de consignación, la empresa actúa como comisionista: no adquiere la propiedad del vehículo, sólo la tenencia para exhibirlo y venderlo por cuenta del consignante, quedando obligada a rendirle cuentas exactas mediante el Formato CACM-RCI-03 una vez vendida la unidad.",
      ],
      fundamento:
        "Fundamento: compra directa – contrato de compraventa, Código Civil Federal (Art. 2248 y ss.); consignación – contrato de comisión mercantil, Código de Comercio (Arts. 273–308), que no transmite el dominio al comisionista y le impone la obligación de rendir cuentas de su gestión.",
    },
    notaArchivo: `${NOTA_EMPRESA} Conservar junto con la documentación legal del vehículo (factura de origen, tarjeta de circulación, etc.).`,
  },

  "CACM-RCI-03": {
    departamento: "Departamento de Tesorería / Control Interno",
    subtitulo: "CÁLCULO DE LO PAGADO AL CONSIGNANTE Y DE LA UTILIDAD NETA DE LA EMPRESA",
    instruccion: INSTRUCCION_MOLDE_BREVE,
    avisoFiscal: AVISO_NO_CFDI,
    declaracion: {
      titulo: "Parte III – Declaración",
      parrafos: [
        "La cantidad señalada como utilidad neta de la empresa constituye un ingreso limpio de Comercializadora Automotriz Cliquealo de México derivado de su comisión mercantil, y deberá registrarse el mismo día en el Corte de Caja Diario (Formato CACM-RCI-07). Ningún socio, accionista o tercero podrá disponer de este importe para uso personal sin la elaboración previa del Vale de Egreso de Caja (Formato CACM-RCI-05).",
        "El consignante declara recibir de conformidad el monto de liquidación señalado en el punto 6, sin nada más que reclamar por esta operación.",
      ],
      fundamento:
        "Fundamento: comisión mercantil, Código de Comercio (Arts. 273–308) y obligación de rendición de cuentas del comisionista; el reparto de utilidades entre socios o accionistas sólo procede después de un balance que efectivamente las arroje, conforme al artículo 19 de la Ley General de Sociedades Mercantiles —por eso toda salida posterior de este importe requiere el vale de egreso correspondiente.",
    },
    notaArchivo: `${NOTA_EMPRESA} Archivar junto con el Formato CACM-RCI-02 correspondiente y el CFDI de la venta.`,
  },

  "CACM-RCI-04": {
    departamento: "Departamento de Servicio / Taller",
    subtitulo: "COBRANZA DEL ÁREA DE SERVICIO / TALLER – ENTREGA AL CUSTODIO FINANCIERO",
    instruccion: INSTRUCCION_MOLDE,
    avisoFiscal: AVISO_NO_CFDI,
    declaracion: {
      titulo: "Parte III – Declaración y Transferencia de Responsabilidad de Custodia",
      parrafos: [
        "Quien cobra declara entregar de forma física, voluntaria y completa el importe señalado, correspondiente íntegramente al servicio descrito.",
        "El Custodio Financiero declara recibirlo a su entera satisfacción y, a partir de la firma de este recibo, asume de manera exclusiva la custodia y responsabilidad sobre el efectivo, quedando quien lo entregó liberado de responsabilidad por cualquier extravío posterior.",
      ],
      fundamento:
        "Fundamento: Código Civil Federal – depósito (Arts. 2516 y ss.); Código Penal Federal – abuso de confianza (Arts. 382–383); Ley Federal del Trabajo – falta de probidad como causa de rescisión sin responsabilidad para el patrón (Art. 47, fracc. II).",
    },
    notaArchivo: `${NOTA_EMPRESA} Conservar junto con la orden de servicio y el CFDI correspondiente.`,
  },

  "CACM-RCI-05": {
    departamento: "Departamento de Tesorería / Control Interno",
    subtitulo:
      "AUTORIZACIÓN Y SALIDA DE EFECTIVO – COMISIONES, RETIRO DE UTILIDADES, PAGOS Y GASTOS",
    instruccion:
      "Ningún efectivo puede salir de caja sin este vale firmado y autorizado. Los campos con (*) son obligatorios.",
    avisoFiscal: AVISO_NO_CFDI,
    declaracion: {
      titulo: "Parte III – Declaración y Autorización",
      parrafos: [
        "Quien recibe el efectivo declara recibirlo completo y a su entera satisfacción, y que su destino es exclusivamente el señalado en el concepto de este vale.",
        "El Custodio Financiero declara haber entregado el importe autorizado, dejando constancia de la salida de efectivo de la caja de la empresa. Tratándose de retiro de utilidades por socios o accionistas, dicho importe se registra como anticipo a cuenta de utilidades hasta que exista un balance que efectivamente arroje utilidades repartibles.",
      ],
      fundamento:
        "Fundamento: artículo 19 de la Ley General de Sociedades Mercantiles (el reparto de utilidades sólo procede después de un balance que efectivamente las arroje; cualquier pacto en contrario no produce efecto legal); obligación de rendición de cuentas de todo mandatario o comisionista; Código Penal Federal – abuso de confianza (Arts. 382–383) aplicable a quien disponga de efectivo sin este vale.",
    },
    notaArchivo: `${NOTA_EMPRESA} Archivar junto con el Corte de Caja Diario (CACM-RCI-07) que registra esta salida.`,
  },

  "CACM-RCI-06": {
    departamento: "Departamento de Recursos Humanos / Nómina",
    subtitulo: "CONSTANCIA DE PAGO DE SUELDO O SALARIO AL TRABAJADOR",
    instruccion: INSTRUCCION_MOLDE_BREVE,
    avisoFiscal: ["Documento de control interno", "Complementa, no sustituye, el CFDI de nómina"],
    declaracion: {
      titulo: "Parte IV – Declaración",
      parrafos: [
        "El trabajador declara haber recibido de conformidad el importe neto señalado, correspondiente al periodo indicado.",
      ],
      fundamento:
        "Fundamento: Ley Federal del Trabajo – el salario en efectivo debe pagarse precisamente en moneda de curso legal (Art. 101); este recibo forma parte de los comprobantes que el patrón está obligado a conservar y exhibir en caso de controversia sobre el pago de salarios (Art. 804).",
    },
    notaArchivo: `${NOTA_EMPRESA} Conservar junto con el CFDI de nómina del periodo, conforme a la normativa fiscal y laboral vigente.`,
  },

  "CACM-RCI-07": {
    departamento: "Departamento de Tesorería / Control Interno",
    subtitulo: "CONCILIACIÓN DE INGRESOS, EGRESOS Y UBICACIÓN DEL EFECTIVO",
    instruccion:
      "Se elabora todos los días, al cierre de operaciones. Los campos con (*) son obligatorios.",
    avisoFiscal: ["Documento de control interno"],
    declaracion: {
      titulo: "Declaración – Rendición de cuentas del día",
      parrafos: [
        "El presente corte constituye la rendición de cuentas diaria de quien tiene a su cargo la custodia del efectivo de la empresa. Cualquier diferencia (faltante) no explicada satisfactoriamente podrá dar lugar a las responsabilidades señaladas en el Recibo de Caja Interno (Formato CACM-RCI-01).",
      ],
      fundamento:
        "Fundamento: la rendición de cuentas es una obligación de hacer —una exposición ordenada de ingresos y egresos con sus comprobantes— propia de todo mandatario o comisionista; falta de probidad como causa de rescisión sin responsabilidad para el patrón (Art. 47, fracc. II, Ley Federal del Trabajo); abuso de confianza (Arts. 382–383, Código Penal Federal).",
    },
    notaArchivo: `${NOTA_EMPRESA} Archivar junto con todos los folios (CACM-RCI-01 a 06) referidos en este corte.`,
  },
};

// ===== ARMADORES DE CADA FORMATO =====

/** Lo que aporta cada formato: sus Partes y, si las tiene, sus casillas extra. */
type ArmadoFormato = {
  partes: Parte[];
  folioExtra?: { etiqueta: string; valor: string };
  encabezadoExtra?: { etiqueta: string; valor: string };
};

type Armador = (documento: DocumentoFinanciero, catalogos: Catalogos) => Promise<ArmadoFormato>;

/** CACM-RCI-01 — Recibo de Caja Interno. */
async function armarRci01(
  documento: DocumentoFinanciero,
  catalogos: Catalogos,
): Promise<ArmadoFormato> {
  const [recibo, arqueo, conceptos, empleados] = await Promise.all([
    obtenerReciboCaja(documento.id),
    obtenerDenominaciones(documento.id),
    catalogos.conceptosCobro(),
    catalogos.empleados(),
  ]);

  const vendedor = empleados.find((empleado) => empleado.id === recibo?.vendedorEmpleadoId);
  const importe = importeEnCasillas(recibo?.importeTotal ?? "0.00");

  const folioVenta =
    recibo?.folioVentaTexto ??
    (recibo?.documentoVentaId !== null && recibo?.documentoVentaId !== undefined
      ? `Documento de venta del expediente No. ${recibo.documentoVentaId}`
      : null);

  const bloquesArqueo: Bloque[] = [
    {
      clase: "tabla",
      columnas: [
        { titulo: "Denominación", fraccion: 0.4 },
        { titulo: "Cantidad", fraccion: 0.26, alineacion: "der" },
        { titulo: "Subtotal", fraccion: 0.34, alineacion: "der" },
      ],
      filas: arqueo.renglones.map((renglon) => [
        montoImpreso(renglon.denominacion),
        String(renglon.cantidad),
        montoImpreso(renglon.subtotal),
      ]),
      totales: [{ etiqueta: "Suma del arqueo", valor: montoImpreso(arqueo.total) }],
      vacio: "Sin desglose de denominaciones capturado.",
    },
    {
      clase: "importe",
      etiqueta: "10. IMPORTE TOTAL ENTREGADO EN EFECTIVO *",
      pesos: importe.pesos,
      centavos: importe.centavos,
      letra: importe.letra,
    },
  ];

  // El descuadre lo decide `validar_arqueo_rci01` al enviar a firma; aquí sólo
  // se advierte, porque un borrador sí puede imprimirse con el conteo a medias
  // y quien lo tenga en la mano necesita ver que todavía no cuadra.
  const sumaArqueo = aCentavos(arqueo.total);
  const declarado = aCentavos(recibo?.importeTotal ?? "0.00");
  if (recibo && sumaArqueo !== null && declarado !== null && sumaArqueo !== declarado) {
    bloquesArqueo.push({
      clase: "nota",
      texto: `El desglose de denominaciones suma ${montoImpreso(arqueo.total)} y no coincide con el importe declarado ${montoImpreso(recibo.importeTotal)}. Este folio no puede enviarse a firma hasta que el arqueo cuadre.`,
    });
  }

  return {
    partes: [
      {
        titulo: "Parte I – Información de la Operación y del Vendedor",
        bloques: [
          {
            clase: "campos",
            campos: [
              {
                numero: 1,
                etiqueta: "Nombre completo del vendedor",
                obligatorio: true,
                valor: vendedor?.nombre ?? null,
              },
              { numero: 2, etiqueta: "No. de empleado", valor: vendedor?.numEmpleado ?? null },
              {
                numero: 3,
                etiqueta: "Identificación oficial del vendedor (tipo y número)",
                obligatorio: true,
                valor: identificacionImpresa(recibo?.vendedorIdTipo, recibo?.vendedorIdNumero),
              },
              {
                numero: 4,
                etiqueta: "Nombre del cliente / comprador",
                obligatorio: true,
                valor: recibo?.clienteNombre ?? null,
              },
              {
                numero: 5,
                etiqueta: "Vehículo (marca / submarca / modelo)",
                valor: recibo?.vehiculoDescripcion ?? null,
              },
              {
                numero: 6,
                etiqueta: "Fecha y hora del cobro",
                obligatorio: true,
                valor: fechaHoraImpresa(recibo?.fechaHoraCobro),
              },
            ],
          },
          {
            clase: "casillas",
            numero: 7,
            etiqueta: "No. de serie (VIN) — un carácter por casilla",
            casillas: casillasVin(recibo?.vin),
          },
          {
            clase: "campos",
            campos: [
              {
                numero: 8,
                etiqueta: "No. de folio de venta / contrato",
                obligatorio: true,
                valor: folioVenta,
                ancho: 2,
              },
            ],
          },
          {
            clase: "opciones",
            numero: 9,
            etiqueta: "Concepto del cobro (marque lo que aplique) *",
            opciones: opcionesDeCatalogo(conceptos, recibo?.conceptoCodigo, recibo?.conceptoOtro),
          },
        ],
      },
      {
        titulo: "Parte II – Detalle del Efectivo Entregado (Arqueo)",
        bloques: bloquesArqueo,
      },
    ],
  };
}

/** CACM-RCI-05 — Vale de Egreso de Caja. */
async function armarRci05(
  documento: DocumentoFinanciero,
  catalogos: Catalogos,
): Promise<ArmadoFormato> {
  const [vale, conceptos, pagos] = await Promise.all([
    obtenerValeEgreso(documento.id),
    catalogos.conceptosEgreso(),
    catalogos.formasPago(),
  ]);

  // El vale puede amparar un folio del propio sistema o un comprobante externo
  // escrito a mano; se resuelve el primero para imprimir el folio y no un id.
  const [folioRelacionado, folioNomina] = await Promise.all([
    vale?.folioRelacionadoId ? obtenerDocumento(vale.folioRelacionadoId) : null,
    vale?.reciboNominaId ? obtenerDocumento(vale.reciboNominaId) : null,
  ]);

  const importe = importeEnCasillas(vale?.importe ?? "0.00");

  const camposCierre: Bloque[] = [
    {
      clase: "campos",
      campos: [
        {
          etiqueta: "Forma de pago",
          valor: etiquetaDe(pagos, vale?.formaPago),
        },
        {
          etiqueta: "Recibo de nómina que ampara el pago (CACM-RCI-06)",
          valor: folioNomina?.folio ?? null,
        },
      ],
    },
  ];

  return {
    partes: [
      {
        titulo: "Parte I – Datos del Egreso",
        bloques: [
          {
            clase: "campos",
            campos: [
              {
                numero: 1,
                etiqueta: "Fecha y hora",
                obligatorio: true,
                valor: fechaHoraImpresa(vale?.fechaHora),
              },
              {
                numero: 2,
                etiqueta: "Folio relacionado (venta, liquidación, factura, etc.)",
                valor: folioRelacionado?.folio ?? vale?.folioRelacionadoTexto ?? null,
              },
              {
                numero: 3,
                etiqueta: "Nombre de quien recibe el efectivo",
                obligatorio: true,
                valor: vale?.beneficiarioNombre ?? null,
              },
              {
                numero: 4,
                etiqueta: "Identificación oficial de quien recibe",
                obligatorio: true,
                valor: identificacionImpresa(vale?.beneficiarioIdTipo, vale?.beneficiarioIdNumero),
              },
            ],
          },
          {
            clase: "opciones",
            numero: 5,
            etiqueta: "Concepto del egreso (marque lo que aplique) *",
            opciones: opcionesDeCatalogo(conceptos, vale?.conceptoCodigo, vale?.conceptoOtro),
          },
          ...camposCierre,
        ],
      },
      {
        titulo: "Parte II – Importe Entregado",
        bloques: [
          {
            clase: "importe",
            etiqueta: "6. IMPORTE ENTREGADO *",
            pesos: importe.pesos,
            centavos: importe.centavos,
            letra: importe.letra,
          },
        ],
      },
    ],
  };
}

/** CACM-RCI-07 — Corte de Caja Diario. */
async function armarRci07(documento: DocumentoFinanciero): Promise<ArmadoFormato> {
  const [corte, detalle, ubicaciones] = await Promise.all([
    obtenerCorte(documento.id),
    detalleCorte(documento.id),
    ubicacionEfectivo(documento.id),
  ]);

  const columnasMovimiento = [
    { titulo: "Concepto", fraccion: 0.4 },
    { titulo: "Folio(s) relacionado(s)", fraccion: 0.38 },
    { titulo: "Importe", fraccion: 0.22, alineacion: "der" as const },
  ];

  const filasDe = (naturaleza: "INGRESO" | "EGRESO"): string[][] =>
    detalle.grupos
      .filter((grupo) => grupo.naturaleza === naturaleza)
      .map((grupo) => [
        grupo.etiqueta,
        grupo.folios.map((folio) => folio.folio).join(", "),
        montoImpreso(grupo.subtotal),
      ]);

  // Depósitos y resguardos no son folios: son efectivo que salió del cajón por
  // otra vía y que el corte suma en sus egresos. Se imprimen como renglón
  // propio para que el total de la Parte II se pueda seguir sumando a mano.
  const filasEgreso = [
    ...filasDe("EGRESO"),
    [
      "Depósito bancario del día (efectivo que sale de caja al banco)",
      "",
      montoImpreso(detalle.totalDepositos),
    ],
    ["En tránsito / otros resguardos", "", montoImpreso(detalle.totalResguardos)],
  ];

  const incisoUbicacion: Record<string, string> = {
    CAJA_FISICA: "a)",
    BANCO: "b)",
    TRANSITO: "c)",
    OTRO: "d)",
  };

  return {
    folioExtra: {
      etiqueta: "Fecha del corte *",
      valor: fechaCivilImpresa(corte?.fechaCorte) ?? "",
    },
    encabezadoExtra: corte?.turno ? { etiqueta: "Turno", valor: corte.turno } : undefined,
    partes: [
      {
        titulo: "Parte I – Ingresos del Día",
        bloques: [
          {
            clase: "campos",
            campos: [
              {
                etiqueta: "Custodio Financiero responsable del efectivo",
                valor: corte?.custodioNombre ?? null,
                ancho: 2,
              },
            ],
          },
          {
            clase: "tabla",
            columnas: columnasMovimiento,
            filas: filasDe("INGRESO"),
            totales: [
              {
                etiqueta: "TOTAL INGRESOS DEL DÍA *",
                valor: montoImpreso(corte?.totalIngresos ?? detalle.totalIngresos),
              },
            ],
            vacio: "El corte no jaló ingresos firmados de este día.",
          },
        ],
      },
      {
        titulo: "Parte II – Egresos del Día",
        bloques: [
          {
            clase: "tabla",
            columnas: columnasMovimiento,
            filas: filasEgreso,
            totales: [
              {
                etiqueta: "TOTAL EGRESOS DEL DÍA *",
                valor: montoImpreso(corte?.totalEgresos ?? detalle.totalEgresos),
              },
            ],
          },
        ],
      },
      {
        titulo: "Parte III – Saldo y Ubicación del Efectivo — ¿Dónde está el dinero?",
        bloques: [
          {
            clase: "tabla",
            columnas: [
              { titulo: "Cálculo del saldo", fraccion: 0.72 },
              { titulo: "Importe", fraccion: 0.28, alineacion: "der" },
            ],
            filas: [
              ["Saldo inicial de caja (corte anterior)", montoImpreso(corte?.saldoInicial)],
              ["(+) Total ingresos del día", montoImpreso(corte?.totalIngresos)],
              ["(–) Total egresos del día", montoImpreso(corte?.totalEgresos)],
              ["(=) Saldo que debería existir en caja", montoImpreso(corte?.saldoCalculado)],
              [
                "Efectivo físico contado al cierre (arqueo real)",
                corte?.efectivoContado === null || corte?.efectivoContado === undefined
                  ? "Pendiente de contar"
                  : montoImpreso(corte.efectivoContado),
              ],
            ],
            totales: [
              {
                etiqueta: "Diferencia (sobrante / faltante)",
                valor:
                  corte?.diferencia === null || corte?.diferencia === undefined
                    ? "Pendiente"
                    : montoImpreso(corte.diferencia),
              },
            ],
          },
          {
            clase: "tabla",
            columnas: [
              { titulo: "Ubicación final del efectivo al cierre", fraccion: 0.36 },
              { titulo: "Institución / cuenta / fecha / detalle", fraccion: 0.42 },
              { titulo: "Importe", fraccion: 0.22, alineacion: "der" },
            ],
            filas: ubicaciones.map((ubicacion) => [
              `${incisoUbicacion[ubicacion.ubicacion] ?? ""} ${ubicacion.etiqueta}`.trim(),
              [
                ubicacion.institucion,
                ubicacion.cuenta,
                fechaCivilImpresa(ubicacion.fecha),
                ubicacion.detalle,
              ]
                .filter(Boolean)
                .join(" · "),
              montoImpreso(ubicacion.monto),
            ]),
            vacio: "El corte todavía no tiene efectivo contado ni depósitos registrados.",
          },
          {
            clase: "campos",
            campos: [
              {
                etiqueta: "Si hay diferencia, explicar:",
                valor: corte?.explicacionDiferencia ?? null,
                ancho: 2,
              },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * Registro de armadores. Los cuatro formatos que faltan se suman aquí: escribir
 * su función `armarRciXX` y añadir su renglón es todo el trabajo.
 */
const ARMADORES: Partial<Record<TipoRci, Armador>> = {
  "CACM-RCI-01": armarRci01,
  "CACM-RCI-05": armarRci05,
  "CACM-RCI-07": armarRci07,
};

/**
 * Un formato sin armador todavía imprime su hoja —encabezado, folio, estado,
 * declaración, firmas y sellos— y DICE que el detalle no está: callarlo haría
 * pasar por completa una hoja a la que le faltan las cifras.
 */
const PARTE_PENDIENTE: Parte = {
  titulo: "Detalle capturado",
  bloques: [
    {
      clase: "nota",
      texto:
        "El detalle de este formato todavía no se imprime en PDF; consúltalo en pantalla. El folio, su estado, sus firmas y sus sellos sí son los que constan en el expediente.",
    },
  ],
};

async function armarPartes(
  documento: DocumentoFinanciero,
  catalogos: Catalogos,
): Promise<ArmadoFormato> {
  const armador = ARMADORES[documento.tipoCodigo];
  return armador ? armador(documento, catalogos) : { partes: [PARTE_PENDIENTE] };
}

// ===== FIRMAS Y SELLOS =====

/**
 * El pie de firmas del papel: primero las rúbricas ya levantadas, en el orden
 * en que la forma las imprime, y después las casillas que siguen vacías.
 *
 * Las pendientes NO se omiten: una hoja a la que le falta la firma del custodio
 * tiene que enseñar esa casilla en blanco, porque eso es exactamente lo que
 * falta para que el dinero tenga dueño.
 */
function firmasImpresas(
  firmas: FirmaDocumento[],
  pendientes: FirmaPendiente[],
): FirmaImpresa[] {
  const levantadas: FirmaImpresa[] = firmas.map((firma) => ({
    etiqueta: firma.rolEtiqueta,
    // Una firma que ya existe no necesita anunciarse como opcional; el dato de
    // si el rol era obligatorio sólo importa mientras la casilla está vacía.
    obligatoria: true,
    nombre: firma.usuarioNombre ?? firma.firmanteNombre,
    identificacion: identificacionImpresa(firma.firmanteIdTipo, firma.firmanteIdNumero),
    fecha: fechaHoraImpresa(firma.firmadoEn),
    detalle:
      firma.metodo === "PIN_USUARIO"
        ? "Firmó con su PIN de usuario"
        : `Firma autógrafa presencial${
            firma.atestiguadoPorNombre ? `, atestiguada por ${firma.atestiguadoPorNombre}` : ""
          }`,
  }));

  const vacias: FirmaImpresa[] = pendientes.map((pendiente) => ({
    etiqueta: pendiente.etiqueta,
    obligatoria: pendiente.obligatoria,
    nombre: null,
    identificacion: null,
    fecha: null,
    detalle: null,
  }));

  return [...levantadas, ...vacias];
}

function sellosImpresos(
  sellos: Awaited<ReturnType<typeof sellosDe>>,
): SelloImpreso[] {
  return sellos.map((sello) => ({
    leyenda: sello.leyenda,
    forma: sello.forma,
    color: sello.color,
    token: sello.token,
    fecha: fechaHoraImpresa(sello.estampadoEn) ?? "",
    estampadoPor: sello.estampadoPorNombre,
    rolEtiqueta: sello.rolEtiqueta,
  }));
}

// ===== SALIDA =====

export type DocumentoPdf = {
  pdf: Uint8Array;
  /** Folio tal como se imprime: CACM-RCI-01-0001. */
  folio: string;
  /** Folio con sucursal, que es el nombre con el que se guarda el archivo. */
  folioCompleto: string;
  nombreTipo: string;
};

/**
 * Dibuja el PDF de un folio financiero. Devuelve null si el folio no existe;
 * quien llame decide si eso es un 404.
 */
export async function pdfDeDocumentoFinanciero(
  documentoId: number,
): Promise<DocumentoPdf | null> {
  const documento = await obtenerDocumento(documentoId);
  if (!documento) return null;

  const catalogos = catalogosPerezosos();
  const [firmas, pendientes, sellos, armado] = await Promise.all([
    firmasDe(documento.id),
    firmasPendientes(documento.id),
    sellosDe(documento.id),
    armarPartes(documento, catalogos),
  ]);

  const textos = TEXTOS[documento.tipoCodigo];
  const plantilla: PlantillaFormato = {
    ...textos,
    // La revisión vigente la manda el catálogo de la base, no una copia local:
    // si el manual sube de revisión, la hoja impresa lo dice sin desplegar.
    avisoFiscal: [
      ...textos.avisoFiscal,
      `Formato: ${documento.tipoCodigo}  |  Rev. ${documento.revision}`,
    ],
    partes: armado.partes,
    folioExtra: armado.folioExtra,
    encabezadoExtra: armado.encabezadoExtra,
  };

  const pdf = await dibujarDocumento({
    formatoCodigo: documento.tipoCodigo,
    nombreTipo: documento.nombreTipo,
    revision: documento.revision,
    folio: documento.folio,
    folioCompleto: documento.folioCompleto,
    sucursal: `${documento.sucursalClave} — ${documento.sucursalNombre}`,
    estado: documento.estado,
    estadoEtiqueta: ETIQUETA_ESTADO_DOCUMENTO[documento.estado ?? "BORRADOR"],
    plantilla,
    firmas: firmasImpresas(firmas, pendientes),
    sellos: sellosImpresos(sellos),
  });

  return {
    pdf,
    folio: documento.folio,
    folioCompleto: documento.folioCompleto,
    nombreTipo: documento.nombreTipo,
  };
}

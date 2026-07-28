import "server-only";

import {
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
  type Color,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";

import type { ColorSello, EstadoDocumentoFinanciero, FormaSello } from "@/lib/finanzas/tipos";

/**
 * Motor de dibujo de las formas CACM-RCI.
 *
 * Los siete formatos NO tienen PDF maestro que rellenar —en `public/formatos`
 * sólo viven los F-01..F-11 y C-01..C-04 del otro módulo—, así que la hoja se
 * dibuja entera con pdf-lib. Este archivo es el LÁPIZ: sabe apilar bandas,
 * partir párrafos, cuadrar tablas, estampar cuños y marcar un borrador, pero no
 * sabe qué dice un recibo de caja ni de dónde salen sus cifras.
 *
 * QUÉ formato lleva qué partes se declara en `documento-pdf.ts`. Añadir el
 * RCI-02 o el RCI-06 es escribir sus `Parte[]` allá, no otro motor aquí.
 */

// ===== GEOMETRÍA =====

/** Carta, que es el papel en el que se imprimen las formas. */
const ANCHO_PAGINA = 612;
const ALTO_PAGINA = 792;
const MARGEN_X = 42;
/** Borde superior del contenido y suelo por encima del pie de página. */
const CIMA = ALTO_PAGINA - 44;
const PISO = 62;
const ANCHO_UTIL = ANCHO_PAGINA - MARGEN_X * 2;

const TAM_EMPRESA = 11.5;
const TAM_TITULO = 15;
const TAM_SUBTITULO = 8;
const TAM_ETIQUETA = 6.5;
const TAM_VALOR = 9;
const TAM_CUERPO = 7.6;
const TAM_MINI = 6;

const TINTA = rgb(0.09, 0.1, 0.12);
const TENUE = rgb(0.42, 0.44, 0.49);
const LINEA = rgb(0.72, 0.74, 0.78);
const FONDO_BARRA = rgb(0.92, 0.93, 0.95);
const FONDO_CAJA = rgb(0.97, 0.975, 0.985);

/** Tinta de cada cuño. Un sello rojo tiene que verse rojo también impreso. */
const TINTA_SELLO: Record<ColorSello, Color> = {
  AZUL: rgb(0.1, 0.24, 0.55),
  ROJO: rgb(0.64, 0.11, 0.16),
  NEGRO: rgb(0.13, 0.14, 0.16),
  VERDE: rgb(0.06, 0.4, 0.24),
};

// ===== TEXTO SEGURO =====

/**
 * Las fuentes estándar (Helvetica) sólo saben escribir el repertorio WinAnsi.
 * Un carácter fuera de él hace que pdf-lib lance, y entonces un nombre tecleado
 * con una comilla rara dejaría al folio sin PDF. Se traduce lo traducible y se
 * sustituye el resto: mejor un signo de interrogación en un nombre que una hoja
 * que no se puede imprimir.
 */
const ESPECIALES_WINANSI = new Set(
  "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ".split(""),
);

export function sanear(texto: string): string {
  const previo = texto
    .normalize("NFC")
    // El guion no separable del manual (CACM-RCI-01) no existe en WinAnsi.
    .replace(/[\u2010\u2011\u2012\u2212]/g, "-")
    .replace(/[\u00a0\u2007\u202f\u200b]/g, " ")
    .replace(/[\r\n\t]/g, " ");

  let salida = "";
  for (const caracter of previo) {
    const punto = caracter.codePointAt(0) ?? 0;
    if ((punto >= 0x20 && punto <= 0x7e) || (punto >= 0xa1 && punto <= 0xff)) {
      salida += caracter;
    } else if (ESPECIALES_WINANSI.has(caracter)) {
      salida += caracter;
    } else {
      salida += "?";
    }
  }
  return salida;
}

// ===== MODELO DECLARATIVO DE UNA FORMA =====

export type Campo = {
  /** Número con el que el campo aparece en el papel. */
  numero?: number;
  etiqueta: string;
  valor: string | null;
  /** Marca el (*) que el manual pone a los campos obligatorios. */
  obligatorio?: boolean;
  /** 2 ocupa el renglón completo; por omisión son dos campos por renglón. */
  ancho?: 1 | 2;
};

export type ColumnaTabla = {
  titulo: string;
  /** Fracción del ancho útil. La suma de las columnas debe dar 1. */
  fraccion: number;
  alineacion?: "izq" | "der";
};

export type RenglonTotal = { etiqueta: string; valor: string; destacado?: boolean };

export type Opcion = { texto: string; marcada: boolean };

export type Bloque =
  | { clase: "campos"; campos: Campo[] }
  | { clase: "casillas"; numero?: number; etiqueta: string; casillas: (string | null)[] }
  | { clase: "opciones"; numero?: number; etiqueta: string; opciones: Opcion[] }
  | {
      clase: "tabla";
      columnas: ColumnaTabla[];
      filas: string[][];
      totales?: RenglonTotal[];
      /** Qué decir cuando no hay un solo renglón que imprimir. */
      vacio?: string;
    }
  | { clase: "importe"; etiqueta: string; pesos: string; centavos: string; letra: string }
  | { clase: "parrafo"; texto: string }
  | { clase: "nota"; texto: string };

export type Parte = { titulo: string; bloques: Bloque[] };

/** La declaración legal de la forma, literal del manual, con su fundamento. */
export type Declaracion = { titulo: string; parrafos: string[]; fundamento: string };

export type PlantillaFormato = {
  /** "Departamento de Tesorería / Control Interno" y sus variantes. */
  departamento: string;
  subtitulo: string;
  /** "Llenar a máquina o con letra de molde…" */
  instruccion: string;
  /** Bloque de la derecha: control interno, CFDI y formato/revisión. */
  avisoFiscal: string[];
  /** Segundo dato junto al folio: la fecha del corte en el RCI-07. */
  folioExtra?: { etiqueta: string; valor: string };
  /** Dato extra del encabezado: el turno en el RCI-07. */
  encabezadoExtra?: { etiqueta: string; valor: string };
  partes: Parte[];
  declaracion: Declaracion;
  notaArchivo: string;
};

export type FirmaImpresa = {
  /** "ENTREGÓ – VENDEDOR", tal como la nombra el catálogo de roles. */
  etiqueta: string;
  obligatoria: boolean;
  /** Nulo cuando la firma todavía no se ha levantado. */
  nombre: string | null;
  identificacion: string | null;
  fecha: string | null;
  /** Cómo se rubricó: con PIN propio o de forma presencial y ante quién. */
  detalle: string | null;
};

export type SelloImpreso = {
  leyenda: string;
  forma: FormaSello;
  color: ColorSello;
  token: string;
  fecha: string;
  estampadoPor: string;
  rolEtiqueta: string | null;
};

export type DocumentoImpreso = {
  formatoCodigo: string;
  /** Nombre oficial del formato; manda el catálogo, no una copia local. */
  nombreTipo: string;
  revision: string;
  folio: string;
  folioCompleto: string;
  sucursal: string;
  estado: EstadoDocumentoFinanciero | null;
  estadoEtiqueta: string;
  plantilla: PlantillaFormato;
  firmas: FirmaImpresa[];
  sellos: SelloImpreso[];
};

// ===== HOJA EN CURSO =====

type Hoja = {
  doc: PDFDocument;
  paginas: PDFPage[];
  pagina: PDFPage;
  /** Borde superior de lo siguiente que se dibuje. */
  y: number;
  normal: PDFFont;
  negrita: PDFFont;
  cursiva: PDFFont;
};

const alto = (tam: number): number => tam * 1.34;

function abrirPagina(hoja: Hoja): void {
  const pagina = hoja.doc.addPage([ANCHO_PAGINA, ALTO_PAGINA]);
  hoja.paginas.push(pagina);
  hoja.pagina = pagina;
  hoja.y = CIMA;
}

/** Salta de página si lo que viene no cabe entero. */
function asegurar(hoja: Hoja, altura: number): void {
  if (hoja.y - altura < PISO) abrirPagina(hoja);
}

function anchoDe(texto: string, fuente: PDFFont, tam: number): number {
  return fuente.widthOfTextAtSize(sanear(texto), tam);
}

/**
 * Parte un texto en líneas que caben en `anchoMax`. Una palabra más ancha que
 * la caja —un VIN pegado, un token— se corta por caracteres en lugar de
 * desbordarse fuera del margen.
 */
function envolver(texto: string, fuente: PDFFont, tam: number, anchoMax: number): string[] {
  const palabras = sanear(texto).split(/\s+/).filter(Boolean);
  const lineas: string[] = [];
  let actual = "";

  const cerrar = () => {
    if (actual !== "") lineas.push(actual);
    actual = "";
  };

  for (const palabra of palabras) {
    const tentativa = actual === "" ? palabra : `${actual} ${palabra}`;
    if (fuente.widthOfTextAtSize(tentativa, tam) <= anchoMax) {
      actual = tentativa;
      continue;
    }
    cerrar();
    if (fuente.widthOfTextAtSize(palabra, tam) <= anchoMax) {
      actual = palabra;
      continue;
    }
    let trozo = "";
    for (const caracter of palabra) {
      if (trozo !== "" && fuente.widthOfTextAtSize(trozo + caracter, tam) > anchoMax) {
        lineas.push(trozo);
        trozo = caracter;
      } else {
        trozo += caracter;
      }
    }
    actual = trozo;
  }
  cerrar();
  return lineas;
}

/** Escribe una línea cuyo BORDE SUPERIOR está en `cima`. */
function escribir(
  pagina: PDFPage,
  texto: string,
  x: number,
  cima: number,
  tam: number,
  fuente: PDFFont,
  color: Color,
): void {
  pagina.drawText(sanear(texto), { x, y: cima - tam, size: tam, font: fuente, color });
}

function parrafo(
  hoja: Hoja,
  texto: string,
  opciones: { x?: number; ancho?: number; tam?: number; fuente?: PDFFont; color?: Color } = {},
): void {
  const x = opciones.x ?? MARGEN_X;
  const anchoCaja = opciones.ancho ?? ANCHO_UTIL;
  const tam = opciones.tam ?? TAM_CUERPO;
  const fuente = opciones.fuente ?? hoja.normal;
  const color = opciones.color ?? TINTA;

  for (const linea of envolver(texto, fuente, tam, anchoCaja)) {
    asegurar(hoja, alto(tam));
    escribir(hoja.pagina, linea, x, hoja.y, tam, fuente, color);
    hoja.y -= alto(tam);
  }
}

function centrar(
  hoja: Hoja,
  texto: string,
  tam: number,
  fuente: PDFFont,
  color: Color,
  anchoCaja = ANCHO_UTIL,
): void {
  for (const linea of envolver(texto, fuente, tam, anchoCaja)) {
    asegurar(hoja, alto(tam));
    const x = MARGEN_X + (anchoCaja - anchoDe(linea, fuente, tam)) / 2;
    escribir(hoja.pagina, linea, x, hoja.y, tam, fuente, color);
    hoja.y -= alto(tam);
  }
}

/** El texto más grande que cabe en `anchoMax`, sin bajar de 4 puntos. */
function tamQueCabe(texto: string, fuente: PDFFont, tamMax: number, anchoMax: number): number {
  let tam = tamMax;
  while (tam > 4 && anchoDe(texto, fuente, tam) > anchoMax) tam -= 0.25;
  return tam;
}

/**
 * Encaja una leyenda dentro de una caja pequeña —la de un cuño— encogiéndola
 * hasta que ninguna palabra tenga que partirse. Un sello con la leyenda cortada
 * a la mitad no acredita nada.
 */
function leyendaAjustada(
  leyenda: string,
  fuente: PDFFont,
  tamMax: number,
  anchoMax: number,
  maxLineas: number,
): { lineas: string[]; tam: number } {
  const palabras = sanear(leyenda).split(/\s+/).filter(Boolean);
  const minimo = 4.5;

  for (let tam = tamMax; tam > minimo; tam -= 0.25) {
    const masAncha = Math.max(...palabras.map((palabra) => anchoDe(palabra, fuente, tam)));
    const lineas = envolver(leyenda, fuente, tam, anchoMax);
    if (masAncha <= anchoMax && lineas.length <= maxLineas) return { lineas, tam };
  }
  return { lineas: envolver(leyenda, fuente, minimo, anchoMax), tam: minimo };
}

function regla(
  pagina: PDFPage,
  x: number,
  ancho: number,
  y: number,
  grosor = 0.6,
  color: Color = LINEA,
): void {
  pagina.drawLine({ start: { x, y }, end: { x: x + ancho, y }, thickness: grosor, color });
}

// ===== ENCABEZADO =====

function textoCampo(campo: Campo): string {
  const numero = campo.numero === undefined ? "" : `${campo.numero}. `;
  return `${numero}${campo.etiqueta}${campo.obligatorio ? " *" : ""}`;
}

function encabezado(hoja: Hoja, datos: DocumentoImpreso): void {
  const { plantilla } = datos;

  // Bloque de la derecha: se dibuja a la misma altura que la razón social,
  // como en el papel, alineado a la derecha para que la revisión quede fija.
  const anchoAviso = 210;
  const xAviso = ANCHO_PAGINA - MARGEN_X - anchoAviso;
  let yAviso = hoja.y;
  for (const [indice, aviso] of plantilla.avisoFiscal.entries()) {
    const fuente = indice === plantilla.avisoFiscal.length - 1 ? hoja.negrita : hoja.normal;
    for (const linea of envolver(aviso, fuente, TAM_MINI, anchoAviso)) {
      const x = ANCHO_PAGINA - MARGEN_X - anchoDe(linea, fuente, TAM_MINI);
      escribir(hoja.pagina, linea, x, yAviso, TAM_MINI, fuente, TENUE);
      yAviso -= alto(TAM_MINI);
    }
  }

  const anchoEmpresa = xAviso - MARGEN_X - 12;
  escribir(hoja.pagina, "COMERCIALIZADORA AUTOMOTRIZ", MARGEN_X, hoja.y, TAM_EMPRESA, hoja.negrita, TINTA);
  hoja.y -= alto(TAM_EMPRESA);
  escribir(hoja.pagina, "CLIQUEALO DE MÉXICO", MARGEN_X, hoja.y, TAM_EMPRESA, hoja.negrita, TINTA);
  hoja.y -= alto(TAM_EMPRESA) + 1;
  for (const linea of envolver(plantilla.departamento, hoja.normal, TAM_SUBTITULO, anchoEmpresa)) {
    escribir(hoja.pagina, linea, MARGEN_X, hoja.y, TAM_SUBTITULO, hoja.normal, TENUE);
    hoja.y -= alto(TAM_SUBTITULO);
  }

  hoja.y = Math.min(hoja.y, yAviso) - 4;
  regla(hoja.pagina, MARGEN_X, ANCHO_UTIL, hoja.y, 0.9, TINTA);
  hoja.y -= 10;

  // Sucursal (y turno, en el corte): el dato que dice de qué caja se habla.
  const sucursal = `Sucursal / Agencia:  ${datos.sucursal}`;
  const extra = plantilla.encabezadoExtra;
  escribir(hoja.pagina, sucursal, MARGEN_X, hoja.y, TAM_SUBTITULO, hoja.negrita, TINTA);
  if (extra) {
    const texto = `${extra.etiqueta}:  ${extra.valor}`;
    const x = ANCHO_PAGINA - MARGEN_X - anchoDe(texto, hoja.negrita, TAM_SUBTITULO);
    escribir(hoja.pagina, texto, x, hoja.y, TAM_SUBTITULO, hoja.negrita, TINTA);
  }
  hoja.y -= alto(TAM_SUBTITULO) + 8;

  centrar(hoja, datos.nombreTipo.toUpperCase(), TAM_TITULO, hoja.negrita, TINTA);
  hoja.y -= 1;
  centrar(hoja, plantilla.subtitulo, TAM_SUBTITULO, hoja.negrita, TENUE);
  hoja.y -= 2;
  centrar(hoja, plantilla.instruccion, TAM_MINI, hoja.cursiva, TENUE);
  hoja.y -= 8;

  cajaFolio(hoja, datos);
}

/** "Folio No." con su consecutivo, el estado del folio y la fecha del corte. */
function cajaFolio(hoja: Hoja, datos: DocumentoImpreso): void {
  const altoCaja = 32;
  asegurar(hoja, altoCaja + 8);
  const cima = hoja.y;
  const extra = datos.plantilla.folioExtra;
  const anchoFolio = extra ? 208 : 240;

  const dibujarCaja = (x: number, ancho: number, etiqueta: string, valor: string, tam: number) => {
    hoja.pagina.drawRectangle({
      x,
      y: cima - altoCaja,
      width: ancho,
      height: altoCaja,
      color: FONDO_CAJA,
      borderColor: TINTA,
      borderWidth: 0.9,
    });
    escribir(hoja.pagina, etiqueta, x + 7, cima - 3, TAM_ETIQUETA, hoja.normal, TENUE);
    escribir(
      hoja.pagina,
      valor,
      x + 7,
      cima - 12,
      tamQueCabe(valor, hoja.negrita, tam, ancho - 14),
      hoja.negrita,
      TINTA,
    );
  };

  dibujarCaja(MARGEN_X, anchoFolio, "Folio No.", datos.folio, 14);
  if (extra) dibujarCaja(MARGEN_X + anchoFolio + 10, 150, extra.etiqueta, extra.valor, 12);

  // El estado va junto al folio a propósito: quien tenga la hoja en la mano
  // debe leer en el mismo golpe de vista si eso está firmado o es un borrador.
  const anchoEstado = 110;
  const xEstado = ANCHO_PAGINA - MARGEN_X - anchoEstado;
  const firmado = datos.estado === "FIRMADO";
  hoja.pagina.drawRectangle({
    x: xEstado,
    y: cima - altoCaja,
    width: anchoEstado,
    height: altoCaja,
    color: firmado ? rgb(0.93, 0.96, 0.93) : rgb(0.99, 0.95, 0.92),
    borderColor: firmado ? TINTA_SELLO.VERDE : TINTA_SELLO.ROJO,
    borderWidth: 0.9,
  });
  escribir(hoja.pagina, "Estado del folio", xEstado + 7, cima - 3, TAM_ETIQUETA, hoja.normal, TENUE);
  const etiquetaEstado = datos.estadoEtiqueta.toUpperCase();
  escribir(
    hoja.pagina,
    etiquetaEstado,
    xEstado + 7,
    cima - 12,
    tamQueCabe(etiquetaEstado, hoja.negrita, 10, anchoEstado - 14),
    hoja.negrita,
    firmado ? TINTA_SELLO.VERDE : TINTA_SELLO.ROJO,
  );

  hoja.y = cima - altoCaja - 12;
}

// ===== BANDAS Y BLOQUES =====

function barra(hoja: Hoja, titulo: string): void {
  const altoBarra = 15;
  asegurar(hoja, altoBarra + 16);
  hoja.pagina.drawRectangle({
    x: MARGEN_X,
    y: hoja.y - altoBarra,
    width: ANCHO_UTIL,
    height: altoBarra,
    color: FONDO_BARRA,
  });
  regla(hoja.pagina, MARGEN_X, ANCHO_UTIL, hoja.y - altoBarra, 0.8, TINTA);
  escribir(hoja.pagina, titulo, MARGEN_X + 6, hoja.y - 3.2, 8.2, hoja.negrita, TINTA);
  hoja.y -= altoBarra + 8;
}

function bloqueCampos(hoja: Hoja, campos: Campo[]): void {
  const hueco = 16;
  const anchoCelda = (ANCHO_UTIL - hueco) / 2;

  let i = 0;
  while (i < campos.length) {
    const primero = campos[i];
    const doble = primero.ancho === 2;
    // Un campo de renglón completo lo ocupa entero venga donde venga: si el
    // siguiente pide `ancho: 2` no se le empareja, se le deja empezar su propio
    // renglón. Sin esto, que un campo saliera ancho o angosto dependería de si
    // le tocó posición par o impar, y el domicilio del RCI-02 o la descripción
    // del servicio del RCI-04 acabarían apretados en media caja.
    const segundo = doble || campos[i + 1]?.ancho === 2 ? undefined : campos[i + 1];

    const celdas = [
      { campo: primero, x: MARGEN_X, ancho: doble ? ANCHO_UTIL : anchoCelda },
      ...(segundo ? [{ campo: segundo, x: MARGEN_X + anchoCelda + hueco, ancho: anchoCelda }] : []),
    ];

    const medidas = celdas.map((celda) => ({
      ...celda,
      etiqueta: envolver(textoCampo(celda.campo), hoja.normal, TAM_ETIQUETA, celda.ancho),
      valor: envolver(celda.campo.valor ?? "", hoja.negrita, TAM_VALOR, celda.ancho - 4),
    }));

    const altoCelda =
      Math.max(
        ...medidas.map(
          (medida) =>
            medida.etiqueta.length * alto(TAM_ETIQUETA) +
            Math.max(1, medida.valor.length) * alto(TAM_VALOR),
        ),
      ) + 4;

    asegurar(hoja, altoCelda + 6);
    const cima = hoja.y;

    for (const medida of medidas) {
      let y = cima;
      for (const linea of medida.etiqueta) {
        escribir(hoja.pagina, linea, medida.x, y, TAM_ETIQUETA, hoja.normal, TENUE);
        y -= alto(TAM_ETIQUETA);
      }
      for (const linea of medida.valor) {
        escribir(hoja.pagina, linea, medida.x + 2, y, TAM_VALOR, hoja.negrita, TINTA);
        y -= alto(TAM_VALOR);
      }
      // El renglón del papel: la casilla se ve aunque el dato venga vacío.
      regla(hoja.pagina, medida.x, medida.ancho, cima - altoCelda + 2);
    }

    hoja.y = cima - altoCelda - 6;
    i += celdas.length;
  }
}

function bloqueCasillas(
  hoja: Hoja,
  bloque: Extract<Bloque, { clase: "casillas" }>,
): void {
  const cuantas = Math.max(1, bloque.casillas.length);
  const hueco = 2.5;
  const ancho = Math.min(20, (ANCHO_UTIL - hueco * (cuantas - 1)) / cuantas);
  const altoCasilla = ancho * 0.9;

  const etiqueta = `${bloque.numero === undefined ? "" : `${bloque.numero}. `}${bloque.etiqueta}`;
  asegurar(hoja, alto(TAM_ETIQUETA) + altoCasilla + 12);
  escribir(hoja.pagina, etiqueta, MARGEN_X, hoja.y, TAM_ETIQUETA, hoja.normal, TENUE);
  const cima = hoja.y - alto(TAM_ETIQUETA) - 2;

  let x = MARGEN_X;
  for (const caracter of bloque.casillas) {
    hoja.pagina.drawRectangle({
      x,
      y: cima - altoCasilla,
      width: ancho,
      height: altoCasilla,
      borderColor: LINEA,
      borderWidth: 0.6,
    });
    if (caracter) {
      const tam = altoCasilla * 0.62;
      const desplazamiento = (ancho - anchoDe(caracter, hoja.negrita, tam)) / 2;
      escribir(hoja.pagina, caracter, x + desplazamiento, cima - altoCasilla * 0.18, tam, hoja.negrita, TINTA);
    }
    x += ancho + hueco;
  }

  hoja.y = cima - altoCasilla - 10;
}

function bloqueOpciones(hoja: Hoja, bloque: Extract<Bloque, { clase: "opciones" }>): void {
  const etiqueta = `${bloque.numero === undefined ? "" : `${bloque.numero}. `}${bloque.etiqueta}`;
  asegurar(hoja, alto(TAM_ETIQUETA) + 14);
  escribir(hoja.pagina, etiqueta, MARGEN_X, hoja.y, TAM_ETIQUETA, hoja.normal, TENUE);
  hoja.y -= alto(TAM_ETIQUETA) + 2;

  const lado = 8;
  const anchoTexto = ANCHO_UTIL - lado - 8;

  for (const opcion of bloque.opciones) {
    const fuente = opcion.marcada ? hoja.negrita : hoja.normal;
    const lineas = envolver(opcion.texto, fuente, TAM_CUERPO, anchoTexto);
    const altoOpcion = Math.max(lado + 3, lineas.length * alto(TAM_CUERPO) + 2);
    asegurar(hoja, altoOpcion);

    hoja.pagina.drawRectangle({
      x: MARGEN_X,
      y: hoja.y - lado - 1,
      width: lado,
      height: lado,
      borderColor: opcion.marcada ? TINTA : LINEA,
      borderWidth: 0.7,
    });
    if (opcion.marcada) {
      hoja.pagina.drawRectangle({
        x: MARGEN_X + 2,
        y: hoja.y - lado + 1,
        width: lado - 4,
        height: lado - 4,
        color: TINTA,
      });
    }

    let y = hoja.y;
    for (const linea of lineas) {
      escribir(hoja.pagina, linea, MARGEN_X + lado + 8, y, TAM_CUERPO, fuente, opcion.marcada ? TINTA : TENUE);
      y -= alto(TAM_CUERPO);
    }
    hoja.y -= altoOpcion;
  }
  hoja.y -= 4;
}

function bloqueTabla(hoja: Hoja, bloque: Extract<Bloque, { clase: "tabla" }>): void {
  const anchos = bloque.columnas.map((columna) => columna.fraccion * ANCHO_UTIL);
  const equis = anchos.reduce<number[]>(
    (acumulado, ancho, indice) => [...acumulado, (acumulado[indice] ?? MARGEN_X) + ancho],
    [MARGEN_X],
  );

  const cabecera = () => {
    const altoCabecera = 15;
    asegurar(hoja, altoCabecera + 20);
    hoja.pagina.drawRectangle({
      x: MARGEN_X,
      y: hoja.y - altoCabecera,
      width: ANCHO_UTIL,
      height: altoCabecera,
      color: FONDO_BARRA,
    });
    bloque.columnas.forEach((columna, indice) => {
      const texto = sanear(columna.titulo);
      const x =
        columna.alineacion === "der"
          ? equis[indice] + anchos[indice] - 4 - anchoDe(texto, hoja.negrita, TAM_ETIQUETA)
          : equis[indice] + 4;
      escribir(hoja.pagina, texto, x, hoja.y - 3.5, TAM_ETIQUETA, hoja.negrita, TINTA);
    });
    regla(hoja.pagina, MARGEN_X, ANCHO_UTIL, hoja.y - altoCabecera, 0.7, TINTA);
    hoja.y -= altoCabecera;
  };

  cabecera();

  if (bloque.filas.length === 0) {
    asegurar(hoja, 18);
    escribir(hoja.pagina, bloque.vacio ?? "Sin renglones", MARGEN_X + 4, hoja.y - 4, TAM_CUERPO, hoja.cursiva, TENUE);
    hoja.y -= 18;
    regla(hoja.pagina, MARGEN_X, ANCHO_UTIL, hoja.y);
  }

  for (const fila of bloque.filas) {
    const celdas = bloque.columnas.map((columna, indice) =>
      envolver(fila[indice] ?? "", hoja.normal, TAM_CUERPO, anchos[indice] - 8),
    );
    const altoFila = Math.max(16, Math.max(...celdas.map((lineas) => lineas.length)) * alto(TAM_CUERPO) + 6);

    if (hoja.y - altoFila < PISO) {
      abrirPagina(hoja);
      cabecera();
    }

    const cima = hoja.y;
    celdas.forEach((lineas, indice) => {
      let y = cima - 4;
      for (const linea of lineas) {
        const x =
          bloque.columnas[indice].alineacion === "der"
            ? equis[indice] + anchos[indice] - 4 - anchoDe(linea, hoja.normal, TAM_CUERPO)
            : equis[indice] + 4;
        escribir(hoja.pagina, linea, x, y, TAM_CUERPO, hoja.normal, TINTA);
        y -= alto(TAM_CUERPO);
      }
    });
    hoja.y = cima - altoFila;
    regla(hoja.pagina, MARGEN_X, ANCHO_UTIL, hoja.y);
  }

  for (const total of bloque.totales ?? []) {
    const altoTotal = 18;
    asegurar(hoja, altoTotal + 2);
    const cima = hoja.y;
    const fuente = total.destacado === false ? hoja.normal : hoja.negrita;
    if (total.destacado !== false) {
      hoja.pagina.drawRectangle({
        x: MARGEN_X,
        y: cima - altoTotal,
        width: ANCHO_UTIL,
        height: altoTotal,
        color: FONDO_BARRA,
      });
    }
    escribir(hoja.pagina, total.etiqueta, MARGEN_X + 4, cima - 5, TAM_CUERPO, fuente, TINTA);
    const x = ANCHO_PAGINA - MARGEN_X - 4 - anchoDe(total.valor, fuente, TAM_CUERPO);
    escribir(hoja.pagina, total.valor, x, cima - 5, TAM_CUERPO, fuente, TINTA);
    hoja.y = cima - altoTotal;
    regla(hoja.pagina, MARGEN_X, ANCHO_UTIL, hoja.y, 0.7, TINTA);
  }

  hoja.y -= 10;
}

function bloqueImporte(hoja: Hoja, bloque: Extract<Bloque, { clase: "importe" }>): void {
  const altoCaja = 34;
  asegurar(hoja, altoCaja + 34);

  escribir(hoja.pagina, bloque.etiqueta, MARGEN_X, hoja.y, 8.4, hoja.negrita, TINTA);
  hoja.y -= alto(8.4) + 2;

  const anchoCaja = ANCHO_UTIL * 0.54;
  const cima = hoja.y;
  hoja.pagina.drawRectangle({
    x: MARGEN_X,
    y: cima - altoCaja,
    width: anchoCaja,
    height: altoCaja,
    color: FONDO_CAJA,
    borderColor: TINTA,
    borderWidth: 1,
  });
  escribir(hoja.pagina, "$", MARGEN_X + 8, cima - 11, 12, hoja.negrita, TINTA);

  // Pesos y centavos separados como en el papel: la forma imprime el punto por
  // adelantado para que nadie pueda añadirle un cero a la cifra después.
  const cifra = `${bloque.pesos} . ${bloque.centavos}`;
  const tam = tamQueCabe(cifra, hoja.negrita, 18, anchoCaja - 40);
  const x = MARGEN_X + anchoCaja - 10 - anchoDe(cifra, hoja.negrita, tam);
  escribir(hoja.pagina, cifra, x, cima - (altoCaja - tam) / 2 + 1, tam, hoja.negrita, TINTA);

  hoja.y = cima - altoCaja - 8;
  escribir(hoja.pagina, "Importe con letra *", MARGEN_X, hoja.y, TAM_ETIQUETA, hoja.normal, TENUE);
  hoja.y -= alto(TAM_ETIQUETA);
  parrafo(hoja, bloque.letra, { tam: 8.4, fuente: hoja.negrita });
  regla(hoja.pagina, MARGEN_X, ANCHO_UTIL, hoja.y - 1);
  hoja.y -= 10;
}

function dibujarBloque(hoja: Hoja, bloque: Bloque): void {
  switch (bloque.clase) {
    case "campos":
      bloqueCampos(hoja, bloque.campos);
      return;
    case "casillas":
      bloqueCasillas(hoja, bloque);
      return;
    case "opciones":
      bloqueOpciones(hoja, bloque);
      return;
    case "tabla":
      bloqueTabla(hoja, bloque);
      return;
    case "importe":
      bloqueImporte(hoja, bloque);
      return;
    case "parrafo":
      parrafo(hoja, bloque.texto);
      hoja.y -= 5;
      return;
    case "nota":
      parrafo(hoja, bloque.texto, { tam: TAM_MINI, fuente: hoja.cursiva, color: TENUE });
      hoja.y -= 5;
      return;
  }
}

// ===== FIRMAS =====

/**
 * El pie de firmas del papel: una casilla por rol, con su línea para la rúbrica
 * autógrafa. Una casilla sin firma NO se omite —el lector tiene que ver que
 * falta— y se marca "PENDIENTE DE FIRMA" en lugar del nombre.
 */
function pieDeFirmas(hoja: Hoja, firmas: FirmaImpresa[]): void {
  if (firmas.length === 0) return;
  barra(hoja, "Firmas");

  const porRenglon = 3;
  const hueco = 12;
  const anchoCelda = (ANCHO_UTIL - hueco * (porRenglon - 1)) / porRenglon;

  for (let i = 0; i < firmas.length; i += porRenglon) {
    const grupo = firmas.slice(i, i + porRenglon);
    const altoCelda = 86;
    asegurar(hoja, altoCelda + 6);
    const cima = hoja.y;

    grupo.forEach((firma, indice) => {
      const x = MARGEN_X + indice * (anchoCelda + hueco);
      let y = cima;

      const titulo = firma.obligatoria ? firma.etiqueta : `${firma.etiqueta} (opcional)`;
      for (const linea of envolver(titulo.toUpperCase(), hoja.negrita, TAM_ETIQUETA, anchoCelda)) {
        escribir(hoja.pagina, linea, x, y, TAM_ETIQUETA, hoja.negrita, TINTA);
        y -= alto(TAM_ETIQUETA);
      }

      // Espacio de la rúbrica: el nombre se imprime justo encima de la línea.
      const yLinea = cima - 48;
      if (firma.nombre) {
        const tam = tamQueCabe(firma.nombre, hoja.negrita, 8.5, anchoCelda);
        escribir(hoja.pagina, firma.nombre, x, yLinea + tam + 3, tam, hoja.negrita, TINTA);
      } else {
        escribir(hoja.pagina, "PENDIENTE DE FIRMA", x, yLinea + 11, 7, hoja.cursiva, TENUE);
      }
      regla(hoja.pagina, x, anchoCelda, yLinea, 0.8, TINTA);

      let yPie = yLinea - 2;
      const pies = [
        "Nombre y firma autógrafa",
        firma.identificacion ? `Identificación: ${firma.identificacion}` : null,
        firma.fecha,
        firma.detalle,
      ].filter((texto): texto is string => Boolean(texto));

      for (const pie of pies) {
        for (const linea of envolver(pie, hoja.normal, TAM_MINI, anchoCelda)) {
          escribir(hoja.pagina, linea, x, yPie, TAM_MINI, hoja.normal, TENUE);
          yPie -= alto(TAM_MINI);
        }
      }
    });

    hoja.y = cima - altoCelda;
  }
  hoja.y -= 6;
}

// ===== SELLOS =====

/**
 * Cada cuño se dibuja como lo que es: un sello de tinta, redondo o rectangular
 * según `accion_sellable.forma`, con su color y su leyenda. El TOKEN va debajo
 * porque es lo único que permite cotejar el papel contra la base: un sello
 * dibujado se copia con una captura de pantalla, un token no se inventa.
 */
function bandaDeSellos(hoja: Hoja, sellos: SelloImpreso[]): void {
  if (sellos.length === 0) return;
  barra(hoja, "Sellos estampados");

  const porRenglon = 3;
  const anchoCelda = ANCHO_UTIL / porRenglon;
  const altoCelda = 112;

  for (let i = 0; i < sellos.length; i += porRenglon) {
    const grupo = sellos.slice(i, i + porRenglon);
    asegurar(hoja, altoCelda + 6);
    const cima = hoja.y;

    grupo.forEach((sello, indice) => {
      const centroX = MARGEN_X + anchoCelda * (indice + 0.5);
      const tinta = TINTA_SELLO[sello.color];
      const cimaCuno = cima - 2;
      const leyenda = sello.leyenda.toUpperCase();

      const centrado = (texto: string, y: number, tam: number, fuente: PDFFont, color: Color) => {
        escribir(hoja.pagina, texto, centroX - anchoDe(texto, fuente, tam) / 2, y, tam, fuente, color);
      };

      const escribirLeyenda = (anchoCaja: number, tamMax: number, maxLineas: number, medio: number) => {
        const ajuste = leyendaAjustada(leyenda, hoja.negrita, tamMax, anchoCaja, maxLineas);
        let y = medio + (ajuste.lineas.length * alto(ajuste.tam)) / 2;
        for (const linea of ajuste.lineas) {
          centrado(linea, y, ajuste.tam, hoja.negrita, tinta);
          y -= alto(ajuste.tam);
        }
      };

      let baseTexto: number;
      if (sello.forma === "CIRCULAR") {
        const radio = 32;
        const centroY = cimaCuno - radio;
        hoja.pagina.drawCircle({ x: centroX, y: centroY, size: radio, borderColor: tinta, borderWidth: 2 });
        hoja.pagina.drawCircle({ x: centroX, y: centroY, size: radio - 4, borderColor: tinta, borderWidth: 0.7 });
        // El texto se encoge hasta caber en la cuerda del anillo interior: en un
        // cuño, "CUSTODIA CONFIRMADA" se lee entero o no se lee.
        escribirLeyenda(radio * 1.45, 8.5, 3, centroY);
        baseTexto = centroY - radio - 5;
      } else {
        const anchoCuno = Math.min(148, anchoCelda - 16);
        const altoCuno = 46;
        const x = centroX - anchoCuno / 2;
        hoja.pagina.drawRectangle({
          x,
          y: cimaCuno - altoCuno,
          width: anchoCuno,
          height: altoCuno,
          borderColor: tinta,
          borderWidth: 2,
        });
        hoja.pagina.drawRectangle({
          x: x + 3,
          y: cimaCuno - altoCuno + 3,
          width: anchoCuno - 6,
          height: altoCuno - 6,
          borderColor: tinta,
          borderWidth: 0.7,
        });
        escribirLeyenda(anchoCuno - 18, 9.5, 2, cimaCuno - altoCuno / 2);
        baseTexto = cimaCuno - altoCuno - 5;
      }

      // Debajo del cuño, lo que permite cotejarlo: el token, cuándo se estampó
      // y quién respondió por ese acto.
      centrado(sello.token, baseTexto, 6.6, hoja.negrita, TINTA);
      let y = baseTexto - alto(6.6);
      const pie = [
        sello.fecha,
        sello.rolEtiqueta ? `${sello.estampadoPor} · ${sello.rolEtiqueta}` : sello.estampadoPor,
      ].filter(Boolean);
      for (const texto of pie) {
        for (const linea of envolver(texto, hoja.normal, 5.5, anchoCelda - 8)) {
          centrado(linea, y, 5.5, hoja.normal, TENUE);
          y -= alto(5.5);
        }
      }
    });

    hoja.y = cima - altoCelda;
  }
  hoja.y -= 4;
}

// ===== MARCA DE AGUA =====

/**
 * Un PDF que no está FIRMADO no puede parecerse a un documento válido: se cruza
 * con la leyenda de su estado en diagonal, sobre todas las páginas.
 *
 * No se reutiliza `conMarcaAgua` de "@/lib/marca-agua" porque aquélla estampa
 * un texto fijo —"PARA CONSULTA INTERNA"— pensado para adjuntos que se
 * consultan; aquí la leyenda ES el estado del folio y cambia con él.
 */
function marcaDeAgua(pagina: PDFPage, texto: string, fuente: PDFFont, color: Color): void {
  // Ni tan grande que la leyenda salga cortada por el borde en cada repetición,
  // ni tan chica que se confunda con el texto de la forma.
  const tam = 30;
  const ancho = fuente.widthOfTextAtSize(texto, tam);
  const pasoX = ancho + tam * 2.4;
  const pasoY = tam * 4.2;
  let fila = 0;

  for (let y = -ALTO_PAGINA * 0.25; y < ALTO_PAGINA * 1.25; y += pasoY, fila += 1) {
    // Tresbolillo: filas alternas desplazadas, para que no queden pasillos
    // limpios por donde la marca se pueda recortar.
    const desfase = (fila % 2) * (pasoX / 2);
    for (let x = -ancho; x < ANCHO_PAGINA + ancho; x += pasoX) {
      pagina.drawText(texto, {
        x: x + desfase,
        y,
        size: tam,
        font: fuente,
        rotate: degrees(35),
        color,
        opacity: 0.13,
      });
    }
  }
}

const LEYENDA_MARCA: Record<EstadoDocumentoFinanciero, string | null> = {
  BORRADOR: "BORRADOR",
  PENDIENTE_DE_FIRMA: "PENDIENTE DE FIRMA",
  CANCELADO: "CANCELADO",
  FIRMADO: null,
};

// ===== PIE DE PÁGINA =====

function pieDePagina(hoja: Hoja, datos: DocumentoImpreso): void {
  const total = hoja.paginas.length;
  const leyenda = `Formato ${datos.formatoCodigo} · Rev. ${datos.revision} · Folio consecutivo obligatorio`;

  hoja.paginas.forEach((pagina, indice) => {
    regla(pagina, MARGEN_X, ANCHO_UTIL, 46, 0.6, LINEA);
    const x = MARGEN_X + (ANCHO_UTIL - anchoDe(leyenda, hoja.normal, TAM_MINI)) / 2;
    escribir(pagina, leyenda, x, 42, TAM_MINI, hoja.normal, TENUE);

    const paginacion = `${datos.folioCompleto} · Página ${indice + 1} de ${total}`;
    const xPaginacion = ANCHO_PAGINA - MARGEN_X - anchoDe(paginacion, hoja.normal, TAM_MINI);
    escribir(pagina, paginacion, xPaginacion, 34, TAM_MINI, hoja.normal, TENUE);
  });
}

// ===== DIBUJO COMPLETO =====

export async function dibujarDocumento(datos: DocumentoImpreso): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const [normal, negrita, cursiva] = await Promise.all([
    doc.embedFont(StandardFonts.Helvetica),
    doc.embedFont(StandardFonts.HelveticaBold),
    doc.embedFont(StandardFonts.HelveticaOblique),
  ]);

  const primera = doc.addPage([ANCHO_PAGINA, ALTO_PAGINA]);
  const hoja: Hoja = {
    doc,
    paginas: [primera],
    pagina: primera,
    y: CIMA,
    normal,
    negrita,
    cursiva,
  };

  encabezado(hoja, datos);

  for (const parte of datos.plantilla.partes) {
    barra(hoja, parte.titulo);
    for (const bloque of parte.bloques) dibujarBloque(hoja, bloque);
  }

  const { declaracion } = datos.plantilla;
  barra(hoja, declaracion.titulo);
  for (const texto of declaracion.parrafos) {
    parrafo(hoja, texto, { tam: TAM_CUERPO });
    hoja.y -= 4;
  }
  hoja.y -= 2;
  parrafo(hoja, declaracion.fundamento, { tam: TAM_MINI, fuente: hoja.cursiva, color: TENUE });
  hoja.y -= 10;

  pieDeFirmas(hoja, datos.firmas);
  bandaDeSellos(hoja, datos.sellos);

  parrafo(hoja, datos.plantilla.notaArchivo, { tam: TAM_MINI, fuente: hoja.cursiva, color: TENUE });

  pieDePagina(hoja, datos);

  const leyenda = LEYENDA_MARCA[datos.estado ?? "BORRADOR"];
  if (leyenda) {
    const color = datos.estado === "CANCELADO" ? TINTA_SELLO.ROJO : rgb(0.35, 0.38, 0.45);
    for (const pagina of hoja.paginas) marcaDeAgua(pagina, leyenda, negrita, color);
  }

  doc.setTitle(`${datos.folio} · ${datos.nombreTipo}`);
  doc.setSubject(`Documento de control interno ${datos.formatoCodigo} · no es CFDI`);
  doc.setProducer("Kuentra DMS · Finanzas CACM-RCI");
  doc.setCreationDate(new Date());

  return doc.save();
}

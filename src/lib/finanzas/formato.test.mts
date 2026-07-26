import assert from "node:assert/strict";
import test from "node:test";

/**
 * formato.ts importa "@/lib/numeros", un alias que sólo existe en tsconfig.
 * El runner de node no lee tsconfig, así que el alias se resuelve aquí antes
 * de cargar el módulo; de otro modo la prueba moriría en ERR_MODULE_NOT_FOUND
 * y habría que ensuciar el módulo de producción con una ruta relativa.
 *
 * registerHooks existe desde node 22.15 pero @types/node 20 aún no lo declara.
 */
const { registerHooks } = (await import("node:module")) as unknown as {
  registerHooks: (enganches: {
    resolve: (
      especificador: string,
      contexto: unknown,
      siguiente: (especificador: string, contexto: unknown) => { url: string },
    ) => { url: string; shortCircuit?: boolean };
  }) => void;
};

const RAIZ_SRC = new URL("../../", import.meta.url);

registerHooks({
  resolve(especificador, contexto, siguiente) {
    if (!especificador.startsWith("@/")) return siguiente(especificador, contexto);
    const destino = especificador.slice(2);
    // El alias de bundler omite la extensión; node la exige.
    const conExtension = /\.[a-z]+$/.test(destino) ? destino : `${destino}.ts`;
    return { url: new URL(conExtension, RAIZ_SRC).href, shortCircuit: true };
  },
});

const {
  LONGITUD_VIN,
  casillasVin,
  custodiaEstaVencida,
  etiquetaCustodia,
  folioCompleto,
  folioImpreso,
  importeEnCasillas,
  normalizarTokenSello,
  vinEnCasillas,
  vinEsValido,
} = await import("./formato.ts");

const VIN = "3VWFE21C04M000001";

// ===== VIN en casillas =====

test("casillasVin entrega el VIN completo en sus 17 casillas", () => {
  const casillas = casillasVin(VIN);

  assert.equal(casillas.length, LONGITUD_VIN);
  // Ninguna casilla queda vacía: el VIN está completo.
  assert.equal(casillas.includes(null), false);
  assert.deepEqual(casillas, VIN.split(""));
});

test("casillasVin rellena con null hasta 17 cuando el VIN está incompleto", () => {
  const casillas = casillasVin("3VWFE21C0");

  // La cuadrícula conserva su tamaño: se ve cuántos caracteres faltan.
  assert.equal(casillas.length, LONGITUD_VIN);
  assert.deepEqual(casillas.slice(0, 9), "3VWFE21C0".split(""));
  assert.deepEqual(casillas.slice(9), Array(8).fill(null));
});

test("casillasVin conserva el tamaño de la cuadrícula sin dato alguno", () => {
  assert.deepEqual(casillasVin(""), Array(LONGITUD_VIN).fill(null));
  assert.deepEqual(casillasVin(null), Array(LONGITUD_VIN).fill(null));
  assert.deepEqual(casillasVin(undefined), Array(LONGITUD_VIN).fill(null));
});

test("casillasVin sube a mayúsculas lo que se tecleó en minúsculas", () => {
  assert.deepEqual(casillasVin(VIN.toLowerCase()), casillasVin(VIN));
  assert.deepEqual(casillasVin("3vwfe21c0"), casillasVin("3VWFE21C0"));
});

test("casillasVin descarta separadores y recorta el excedente de 17", () => {
  assert.deepEqual(casillasVin("3vw-fe21c 04m000001"), VIN.split(""));
  assert.deepEqual(casillasVin(`${VIN}XYZ`), VIN.split(""));
});

test("vinEnCasillas separa carácter por carácter y marca los faltantes", () => {
  assert.equal(vinEnCasillas(VIN), "3 V W F E 2 1 C 0 4 M 0 0 0 0 0 1");
  assert.equal(vinEnCasillas("3VWFE21C0"), "3 V W F E 2 1 C 0 _ _ _ _ _ _ _ _");
  assert.equal(vinEnCasillas("3vwfe21c04m000001"), vinEnCasillas(VIN));
  // Siempre 17 casillas y 16 espacios, esté completo o no.
  assert.equal(vinEnCasillas(null).length, LONGITUD_VIN * 2 - 1);
});

test("vinEsValido rechaza las letras que se confunden con dígitos", () => {
  assert.equal(vinEsValido(VIN), true);
  assert.equal(vinEsValido(VIN.toLowerCase()), true);

  for (const ambigua of ["I", "O", "Q"]) {
    assert.equal(vinEsValido(`${VIN.slice(0, 16)}${ambigua}`), false, `${ambigua} debió rechazarse`);
  }

  assert.equal(vinEsValido(VIN.slice(0, 16)), false);
  assert.equal(vinEsValido(`${VIN}1`), false);
});

// ===== Importe en casillas =====

test("importeEnCasillas separa millares en la parte entera", () => {
  assert.equal(importeEnCasillas("1234567.50").pesos, "1,234,567");
  assert.equal(importeEnCasillas("1234567.50").texto, "$1,234,567.50");
  assert.equal(importeEnCasillas("999.99").pesos, "999");
  assert.equal(importeEnCasillas("1000.00").pesos, "1,000");
});

test("importeEnCasillas acepta el importe ya formateado con comas", () => {
  assert.deepEqual(importeEnCasillas("1,234,567.50"), importeEnCasillas("1234567.50"));
});

test("importeEnCasillas imprime los centavos siempre con dos dígitos", () => {
  assert.equal(importeEnCasillas("1500").centavos, "00");
  assert.equal(importeEnCasillas("1500.5").centavos, "50");
  assert.equal(importeEnCasillas("1500.05").centavos, "05");
  assert.equal(importeEnCasillas("1500.5").texto, "$1,500.50");
  assert.equal(importeEnCasillas("0.5").texto, "$0.50");
});

test("importeEnCasillas recorta los ceros a la izquierda sin borrar el peso cero", () => {
  assert.equal(importeEnCasillas("00012345.6").pesos, "12,345");
  assert.equal(importeEnCasillas("0.75").pesos, "0");
  assert.equal(importeEnCasillas("0").texto, "$0.00");
});

test("importeEnCasillas escribe el importe con letra que exigen RCI-01, 04, 05 y 06", () => {
  assert.equal(
    importeEnCasillas("1234567.50").letra,
    "UN MILLÓN DOSCIENTOS TREINTA Y CUATRO MIL QUINIENTOS SESENTA Y SIETE PESOS 50/100 M.N.",
  );
  assert.equal(importeEnCasillas("1500.5").letra, "UN MIL QUINIENTOS PESOS 50/100 M.N.");
  assert.equal(importeEnCasillas("1.00").letra, "UN PESO 00/100 M.N.");
  assert.equal(importeEnCasillas("21").letra, "VEINTIÚN PESOS 00/100 M.N.");
  assert.equal(importeEnCasillas("0").letra, "CERO PESOS 00/100 M.N.");
});

test("importeEnCasillas conserva los centavos de un monto de ocho dígitos", () => {
  // Number("10000000.03") * 100 da 1000000002.9999999: aquí se opera sobre la cadena.
  const casillas = importeEnCasillas("10000000.03");

  assert.equal(casillas.pesos, "10,000,000");
  assert.equal(casillas.centavos, "03");
  assert.equal(casillas.texto, "$10,000,000.03");
});

test("importeEnCasillas cae a cero ante un importe ilegible en vez de romper la forma", () => {
  for (const basura of ["abc", "", "1.234", "$100", "12e3"]) {
    assert.deepEqual(
      importeEnCasillas(basura),
      { pesos: "0", centavos: "00", texto: "$0.00", letra: "CERO PESOS 00/100 M.N." },
      `${JSON.stringify(basura)} debió caer a cero`,
    );
  }
});

// ===== Token del sello =====

const TOKEN = "CACM-7K3M-9P2R-4T5V";

test("normalizarTokenSello agrupa el token que se tecleó pegado", () => {
  assert.equal(normalizarTokenSello("CACM7K3M9P2R4T5V"), TOKEN);
});

test("normalizarTokenSello acepta el token con los guiones ya puestos", () => {
  assert.equal(normalizarTokenSello(TOKEN), TOKEN);
  // Quien lo copia del papel puede separarlo de cualquier modo.
  assert.equal(normalizarTokenSello("CACM 7K3M 9P2R 4T5V"), TOKEN);
  assert.equal(normalizarTokenSello("CACM--7K3M.9P2R/4T5V"), TOKEN);
});

test("normalizarTokenSello sube a mayúsculas lo tecleado en minúsculas", () => {
  assert.equal(normalizarTokenSello("cacm7k3m9p2r4t5v"), TOKEN);
  assert.equal(normalizarTokenSello("cacm-7k3m-9p2r-4t5v"), TOKEN);
});

test("normalizarTokenSello devuelve null cuando el token no es acuñable", () => {
  const invalidos = [
    "", // vacío
    "CACM-7K3M-9P2R-4T5", // le falta un carácter
    "CACM-7K3M-9P2R-4T5VX", // le sobra uno
    "RCI0-7K3M-9P2R-4T5V", // prefijo ajeno
    "7K3M-9P2R-4T5V", // sin prefijo
    "CACM-7K3M-9P2R-4T5I", // I, L, O y U no existen en base32 de Crockford
    "CACM-7K3M-9P2R-4T5L",
    "CACM-7K3M-9P2R-4T5O",
    "CACM-7K3M-9P2R-4T5U",
  ];

  for (const token of invalidos) {
    assert.equal(normalizarTokenSello(token), null, `${JSON.stringify(token)} debió rechazarse`);
  }
});

// ===== Custodia y folios =====

test("custodiaEstaVencida avisa a partir de las cuatro horas en tránsito", () => {
  assert.equal(custodiaEstaVencida(3.9), false);
  assert.equal(custodiaEstaVencida(4), true);
  assert.equal(custodiaEstaVencida(9), true);
  assert.equal(custodiaEstaVencida(null), false);
  assert.equal(custodiaEstaVencida(undefined), false);
  assert.equal(custodiaEstaVencida(2, 1), true);
});

test("etiquetaCustodia no da por resguardado el dinero que nadie ha aceptado", () => {
  assert.equal(etiquetaCustodia(true), "Custodia confirmada");
  assert.equal(
    etiquetaCustodia(false),
    "Entregado por el vendedor, pendiente de confirmar custodia",
  );
});

test("los folios se imprimen con el consecutivo a cuatro dígitos", () => {
  assert.equal(folioImpreso("CACM-RCI-01", 1), "CACM-RCI-01-0001");
  assert.equal(folioImpreso("CACM-RCI-07", 1234), "CACM-RCI-07-1234");
  assert.equal(folioCompleto("CACM-RCI-01", "MTY", 1), "CACM-RCI-01-MTY-0001");
});

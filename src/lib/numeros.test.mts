import assert from "node:assert/strict";
import test from "node:test";

import { canonizarNumeroCaptura, formatearNumeroCaptura, monedaEnLetras } from "./numeros.ts";

test("muestra miles y millones dentro del input sin perder decimales", () => {
  assert.equal(formatearNumeroCaptura("1250345.67"), "1,250,345.67");
  assert.equal(formatearNumeroCaptura("450000"), "450,000");
});

test("convierte el valor formateado al decimal canónico para persistir", () => {
  assert.equal(canonizarNumeroCaptura("450,000.50"), "450000.50");
  assert.equal(canonizarNumeroCaptura("000,450"), "000450");
});

test("rechaza valores que no son numéricos antes de actualizar el formulario", () => {
  assert.equal(canonizarNumeroCaptura(""), "");
  assert.equal(canonizarNumeroCaptura("450 mil"), null);
  assert.equal(canonizarNumeroCaptura("12e3"), null);
  assert.equal(canonizarNumeroCaptura("450.123"), null);
});

// ===== Importe con letra =====

test("monedaEnLetras escribe el importe con letra que cierra la alteración", () => {
  assert.equal(monedaEnLetras("1234567.50"),
    "UN MILLÓN DOSCIENTOS TREINTA Y CUATRO MIL QUINIENTOS SESENTA Y SIETE PESOS 50/100 M.N.");
  assert.equal(monedaEnLetras("1500.5"), "UN MIL QUINIENTOS PESOS 50/100 M.N.");
  assert.equal(monedaEnLetras("1.00"), "UN PESO 00/100 M.N.");
  assert.equal(monedaEnLetras("0"), "CERO PESOS 00/100 M.N.");
});

/**
 * El faltante de un corte, el saldo de una caja que depositó más de lo que sus
 * folios firmados respaldan y la utilidad de una consigna vendida con pérdida
 * son negativos de verdad. Cuando esto reventaba, la pantalla que sólo quería
 * mostrar la cifra se caía con un error de servidor.
 */
test("monedaEnLetras escribe los importes negativos en lugar de rechazarlos", () => {
  assert.equal(monedaEnLetras("-5000.00"), "MENOS CINCO MIL PESOS 00/100 M.N.");
  assert.equal(monedaEnLetras("-0.01"), "MENOS CERO PESOS 01/100 M.N.");
  assert.equal(monedaEnLetras(-1), "MENOS UN PESO 00/100 M.N.");
  // "MENOS CERO" no existe: lo que redondea a cero se escribe cero.
  assert.equal(monedaEnLetras("-0.001"), "CERO PESOS 00/100 M.N.");
});

test("monedaEnLetras se niega a escribir lo que no sabe deletrear", () => {
  // A partir de mil millones la letra saldría falsa, y una letra equivocada es
  // peor que ninguna: es lo que cierra la alteración del importe.
  assert.throws(() => monedaEnLetras("1000000000.00"), /El monto debe estar entre/);
  assert.throws(() => monedaEnLetras("-1000000000.00"), /El monto debe estar entre/);
  // El extremo del rango sí se escribe, por arriba y por abajo.
  assert.match(monedaEnLetras("999999999.99"), /^NOVECIENTOS NOVENTA Y NUEVE MILLONES/);
  assert.match(monedaEnLetras("-999999999.99"), /^MENOS NOVECIENTOS NOVENTA Y NUEVE MILLONES/);
});

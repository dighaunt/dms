import assert from "node:assert/strict";
import test from "node:test";

import { canonizarNumeroCaptura, formatearNumeroCaptura } from "./numeros.ts";

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

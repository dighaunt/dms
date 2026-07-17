import assert from "node:assert/strict";
import test from "node:test";

import { lecturaNumeroAgrupado } from "./numeros.ts";

test("separa importes grandes sin perder sus decimales", () => {
  assert.deepEqual(lecturaNumeroAgrupado("1250345.67"), {
    agrupado: "1,250,345.67",
    escala: "1 millón · 250 mil · 345 unidades",
  });
});

test("hace legibles centenas de miles y millones", () => {
  assert.deepEqual(lecturaNumeroAgrupado("100000"), {
    agrupado: "100,000",
    escala: "100 mil",
  });
  assert.deepEqual(lecturaNumeroAgrupado("2000000"), {
    agrupado: "2,000,000",
    escala: "2 millones",
  });
});

test("no inventa una lectura para una captura incompleta o inválida", () => {
  assert.equal(lecturaNumeroAgrupado(""), null);
  assert.equal(lecturaNumeroAgrupado("12e3"), null);
});

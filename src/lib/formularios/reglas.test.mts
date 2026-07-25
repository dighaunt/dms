import assert from "node:assert/strict";
import test from "node:test";

import {
  aplicarReglasFormulario,
  camposRequeridosPorReglas,
  rellenosActivos,
  type ReglaFormulario,
} from "./reglas.ts";

// Mismas reglas que el catálogo declara para C-02. Los tres campos de cobertura
// llegan con required del AcroForm, que no distingue CON de SIN garantía.
const REGLAS_C02: ReglaFormulario[] = [
  {
    when: { field: "c02_gar", equals: "SIN" },
    fill: { c02_gar_dias: "NO APLICA", c02_gar_km: "NO APLICA", c02_gar_cubre: "NO APLICA" },
  },
  {
    when: { field: "c02_gar", equals: "CON" },
    require: ["c02_gar_dias", "c02_gar_km", "c02_gar_cubre"],
  },
];

const BASE_C02 = ["c02_gar", "c02_gar_dias", "c02_gar_km", "c02_gar_cubre"];

test("C-02 sin garantía anula la cobertura y deja de exigirla", () => {
  const values = aplicarReglasFormulario(REGLAS_C02, { c02_gar: "SIN" });
  assert.deepEqual(
    [values.c02_gar_dias, values.c02_gar_km, values.c02_gar_cubre],
    ["NO APLICA", "NO APLICA", "NO APLICA"],
  );

  const required = camposRequeridosPorReglas(REGLAS_C02, BASE_C02, values);
  assert.equal(required.has("c02_gar"), true);
  for (const name of ["c02_gar_dias", "c02_gar_km", "c02_gar_cubre"]) {
    assert.equal(required.has(name), false, `${name} no se captura cuando no hay garantía`);
  }
});

test("C-02 con garantía sigue exigiendo días, kilómetros y cobertura", () => {
  const values = aplicarReglasFormulario(REGLAS_C02, { c02_gar: "CON" });
  const required = camposRequeridosPorReglas(REGLAS_C02, BASE_C02, values);
  for (const name of ["c02_gar_dias", "c02_gar_km", "c02_gar_cubre"]) {
    assert.equal(values[name] ?? "", "", `${name} no conserva el NO APLICA anterior`);
    assert.equal(required.has(name), true);
  }
});

test("mientras la garantía no se responde, la cobertura conserva su obligatoriedad base", () => {
  const required = camposRequeridosPorReglas(REGLAS_C02, BASE_C02, {});
  assert.equal(required.has("c02_gar_dias"), true);
});

test("pasar de SIN a CON garantía no arrastra el NO APLICA que puso la regla", () => {
  const sin = aplicarReglasFormulario(REGLAS_C02, { c02_gar: "SIN" });
  const con = aplicarReglasFormulario(REGLAS_C02, { ...sin, c02_gar: "CON" });
  assert.equal(con.c02_gar_dias, "");
  assert.equal(con.c02_gar_cubre, "");
});

test("un dato capturado a mano sobrevive al cambio de condición", () => {
  const con = aplicarReglasFormulario(REGLAS_C02, { c02_gar: "CON", c02_gar_dias: "90" });
  assert.equal(con.c02_gar_dias, "90");
});

test("C-04 sin seguro cierra la póliza; con responsable la exige", () => {
  const reglas: ReglaFormulario[] = [
    { when: { field: "c04_seg", equals: "SIN" }, fill: { c04_poliza: "NO APLICA" } },
    { when: { field: "c04_seg", equals: "CONSIGNANTE" }, require: ["c04_poliza"] },
  ];
  const base = ["c04_seg", "c04_poliza"];

  const sin = aplicarReglasFormulario(reglas, { c04_seg: "SIN" });
  assert.equal(sin.c04_poliza, "NO APLICA");
  assert.equal(camposRequeridosPorReglas(reglas, base, sin).has("c04_poliza"), false);

  const conResponsable = aplicarReglasFormulario(reglas, { c04_seg: "CONSIGNANTE" });
  assert.equal(camposRequeridosPorReglas(reglas, base, conResponsable).has("c04_poliza"), true);
});

test("si una condición vigente exige el dato, gana sobre la que lo anula", () => {
  const reglas: ReglaFormulario[] = [
    { when: { field: "a", equals: "SI" }, fill: { dato: "NO APLICA" } },
    { when: { field: "b", equals: "SI" }, require: ["dato"] },
  ];
  const required = camposRequeridosPorReglas(reglas, [], { a: "SI", b: "SI" });
  assert.equal(required.has("dato"), true);
});

test("rellenosActivos sólo reporta las reglas cuya condición se cumple", () => {
  assert.deepEqual([...rellenosActivos(REGLAS_C02, { c02_gar: "CON" }).keys()], []);
  assert.deepEqual([...rellenosActivos(REGLAS_C02, { c02_gar: "SIN" }).keys()], [
    "c02_gar_dias",
    "c02_gar_km",
    "c02_gar_cubre",
  ]);
});

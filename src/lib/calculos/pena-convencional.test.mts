import assert from "node:assert/strict";
import test from "node:test";

import { configuracionCalculoPena, vistaCalculoPena } from "./pena-convencional.ts";

function configuracion() {
  const value = configuracionCalculoPena("C-01");
  assert.ok(value, "Debe existir la configuración de C-01");
  return value;
}

test("C-01 calcula pena y devolución desde apartado, precio y porcentaje", () => {
  const result = vistaCalculoPena(configuracion(), {
    c01_monto_num: "10000.00",
    c01_precio_total: "250000.00",
    C01_inl_30: "12.5",
  });

  assert.deepEqual(result, {
    estado: "RESUELTO",
    faltantes: [],
    montoBase: "$10,000.00 MXN",
    obligacionPrincipal: "$250,000.00 MXN",
    porcentaje: "12.5%",
    montoPena: "$1,250.00 MXN",
    montoDevolucion: "$8,750.00 MXN",
  });
});

test("C-01 limita la pena a la obligación principal", () => {
  const result = vistaCalculoPena(configuracion(), {
    c01_monto_num: "10000",
    c01_precio_total: "8000",
    C01_inl_30: "200",
  });

  assert.equal(result.montoPena, "$8,000.00 MXN");
  assert.equal(result.montoDevolucion, "$2,000.00 MXN");
});

test("C-01 no calcula hasta que el orden de sus insumos esté completo", () => {
  const pending = vistaCalculoPena(configuracion(), { C01_inl_30: "3" });
  assert.equal(pending.estado, "PENDIENTE");
  assert.deepEqual(
    pending.faltantes.map((field) => field.name),
    ["c01_monto_num", "c01_precio_total"],
  );
});

import assert from "node:assert/strict";
import test from "node:test";

import { configuracionCalculoPena, vistaCalculoPena } from "./pena-convencional.ts";

function configuracion() {
  const value = configuracionCalculoPena("C-01");
  assert.ok(value, "Debe existir la configuración de C-01");
  return value;
}

test("C-01 calcula pena y devolución con el porcentaje contractual automático", () => {
  const result = vistaCalculoPena(configuracion(), {
    c01_monto_num: "10000.00",
    c01_precio_total: "250000.00",
  });

  assert.deepEqual(result, {
    estado: "RESUELTO",
    faltantes: [],
    montoBase: "$10,000.00 MXN",
    obligacionPrincipal: "$250,000.00 MXN",
    porcentaje: "50%",
    montoPena: "$5,000.00 MXN",
    montoDevolucion: "$5,000.00 MXN",
  });
});

test("C-01 limita la pena a la obligación principal", () => {
  const result = vistaCalculoPena(configuracion(), {
    c01_monto_num: "10000",
    c01_precio_total: "4000",
  });

  assert.equal(result.montoPena, "$4,000.00 MXN");
  assert.equal(result.montoDevolucion, "$6,000.00 MXN");
});

test("C-01 no calcula hasta que los dos importes fuente estén completos", () => {
  const pending = vistaCalculoPena(configuracion(), {});
  assert.equal(pending.estado, "PENDIENTE");
  assert.deepEqual(
    pending.faltantes.map((field) => field.name),
    ["c01_monto_num", "c01_precio_total"],
  );
});

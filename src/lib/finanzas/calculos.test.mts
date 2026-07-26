import assert from "node:assert/strict";
import test from "node:test";

import {
  aCentavos,
  arqueoCorte,
  deCentavos,
  estadoValeEgreso,
  explicacionDiferenciaEsSuficiente,
  FIRMANTES_VALE_EGRESO,
  MINIMO_EXPLICACION_DIFERENCIA,
  posicionSocio,
  utilidadConsigna,
} from "./calculos.ts";

// ===== aCentavos / deCentavos =====

test("aCentavos y deCentavos hacen ida y vuelta sin perder centavos", () => {
  for (const monto of ["0.00", "0.01", "0.99", "1.00", "12345.67", "999999999999999.99"]) {
    assert.equal(deCentavos(aCentavos(monto)!), monto, `se perdio precision en ${monto}`);
  }
});

test("aCentavos acepta la cifra con separadores de millares tal como la teclean", () => {
  assert.equal(aCentavos("12,345.67"), 1234567n);
  assert.equal(aCentavos("1,234,567.89"), 123456789n);
  // Con y sin separadores debe dar exactamente lo mismo: el separador es visual.
  assert.equal(aCentavos("1,234,567.89"), aCentavos("1234567.89"));
});

test("aCentavos rellena los centavos que el capturista omitio", () => {
  assert.equal(aCentavos("100"), 10000n);
  assert.equal(aCentavos("100.5"), 10050n);
  assert.equal(deCentavos(aCentavos("100.5")!), "100.50");
});

test("aCentavos conserva el signo negativo", () => {
  assert.equal(aCentavos("-500.25"), -50025n);
  assert.equal(deCentavos(-50025n), "-500.25");
  assert.equal(deCentavos(-5n), "-0.05");
});

test("deCentavos siempre imprime dos decimales, como espera numeric(18,2)", () => {
  assert.equal(deCentavos(0n), "0.00");
  assert.equal(deCentavos(5n), "0.05");
  assert.equal(deCentavos(50n), "0.50");
  assert.equal(deCentavos(100n), "1.00");
});

test("0.1 + 0.2 en centavos da 0.30 y no el 0.30000000000000004 del flotante", () => {
  // La razon de ser del modulo: este es el error que un double introduce.
  assert.notEqual(0.1 + 0.2, 0.3);
  assert.equal((0.1 + 0.2).toString(), "0.30000000000000004");

  const suma = aCentavos("0.10")! + aCentavos("0.20")!;
  assert.equal(suma, 30n);
  assert.equal(deCentavos(suma), "0.30");
});

test("un monto de 8 digitos con centavos no pierde el centavo que el flotante trunca", () => {
  const bruto = "10000000.03";

  // En punto flotante este importe ni siquiera se representa exacto: al pasarlo
  // a centavos queda en 1000000002.9999999 y truncarlo se come un centavo.
  assert.equal(Number(bruto) * 100, 1000000002.9999999);
  assert.equal(Math.trunc(Number(bruto) * 100), 1_000_000_002);

  assert.equal(aCentavos(bruto), 1_000_000_003n);
  assert.equal(deCentavos(aCentavos(bruto)!), bruto);
});

test("aCentavos devuelve null ante entradas que no son un decimal valido", () => {
  const invalidas = [
    null,
    undefined,
    "",
    "   ",
    "abc",
    "450 mil",
    "12e3",
    "1.234", // tres decimales no caben en numeric(18,2)
    "$100.00",
    ".50",
    "5.",
    "+5",
    "1..2",
    "-",
  ];

  for (const valor of invalidas) {
    assert.equal(aCentavos(valor), null, `${JSON.stringify(valor)} debio rechazarse`);
  }
});

// ===== Regla 3 — utilidad de consigna =====

test("utilidadConsigna reproduce el caso del manual: 200000 - 175000 - 13000 = 12000", () => {
  const resultado = utilidadConsigna({
    precioVenta: "200000.00",
    montoConsignante: "175000.00",
    gastos: [
      { concepto: "Hojalateria y pintura", importe: "8000.00" },
      { concepto: "Detallado y traslado", importe: "5000.00" },
    ],
  });

  assert.deepEqual(resultado, {
    precioVenta: "200000.00",
    montoConsignante: "175000.00",
    gastosTotal: "13000.00",
    utilidadNeta: "12000.00",
    esNegativa: false,
  });
});

test("utilidadConsigna sin gastos deja el margen completo", () => {
  const resultado = utilidadConsigna({
    precioVenta: "200000",
    montoConsignante: "175000",
  });

  assert.equal(resultado!.gastosTotal, "0.00");
  assert.equal(resultado!.utilidadNeta, "25000.00");
  assert.equal(resultado!.esNegativa, false);

  // Una lista vacia debe comportarse igual que la ausencia de gastos.
  assert.deepEqual(
    utilidadConsigna({ precioVenta: "200000", montoConsignante: "175000", gastos: [] }),
    resultado,
  );
});

test("utilidadConsigna senala la perdida cuando los gastos se comen el margen", () => {
  const resultado = utilidadConsigna({
    precioVenta: "150000.00",
    montoConsignante: "145000.00",
    gastos: [{ concepto: "Reparacion de motor", importe: "8000.00" }],
  });

  // No se rechaza: se declara. Una consigna con perdida es justo lo que el socio necesita ver.
  assert.equal(resultado!.utilidadNeta, "-3000.00");
  assert.equal(resultado!.esNegativa, true);
});

test("utilidadConsigna de un vehiculo de ocho digitos no arrastra el error del flotante", () => {
  // El mismo calculo en double da 75308641.99000001.
  assert.equal(87654321.11 - 12345678.99 - 0.13, 75308641.99000001);

  const resultado = utilidadConsigna({
    precioVenta: "87654321.11",
    montoConsignante: "12345678.99",
    gastos: [{ concepto: "Traslado", importe: "0.13" }],
  });

  assert.equal(resultado!.utilidadNeta, "75308641.99");
});

test("utilidadConsigna devuelve null si algun importe es ilegible", () => {
  assert.equal(utilidadConsigna({ precioVenta: "abc", montoConsignante: "1000" }), null);
  assert.equal(utilidadConsigna({ precioVenta: "1000", montoConsignante: "" }), null);
  assert.equal(
    utilidadConsigna({
      precioVenta: "200000",
      montoConsignante: "175000",
      gastos: [{ concepto: "Ilegible", importe: "mil pesos" }],
    }),
    null,
  );
});

// ===== Regla 4 — tres firmantes distintos en el vale de egreso =====

const VALE_COMPLETO = [
  { rolFirmante: "AUTORIZO_GERENTE", usuarioId: 1 },
  { rolFirmante: "ENTREGO_CUSTODIO", usuarioId: 2 },
  { rolFirmante: "RECIBIO_BENEFICIARIO", usuarioId: 3 },
];

test("estadoValeEgreso da por completo el vale con los tres roles y tres personas distintas", () => {
  assert.deepEqual(estadoValeEgreso(VALE_COMPLETO), {
    completo: true,
    rolesFaltantes: [],
    firmantesDuplicados: false,
  });
});

test("estadoValeEgreso reporta exactamente el rol que falta", () => {
  for (const ausente of FIRMANTES_VALE_EGRESO) {
    const firmas = VALE_COMPLETO.filter((f) => f.rolFirmante !== ausente);
    const estado = estadoValeEgreso(firmas);

    assert.deepEqual(estado.rolesFaltantes, [ausente]);
    assert.equal(estado.completo, false);
    assert.equal(estado.firmantesDuplicados, false);
  }
});

test("estadoValeEgreso enumera los tres roles cuando no hay ninguna firma", () => {
  assert.deepEqual(estadoValeEgreso([]), {
    completo: false,
    rolesFaltantes: ["AUTORIZO_GERENTE", "ENTREGO_CUSTODIO", "RECIBIO_BENEFICIARIO"],
    firmantesDuplicados: false,
  });
});

test("estadoValeEgreso rompe la segregacion si dos roles son la misma persona", () => {
  const estado = estadoValeEgreso([
    { rolFirmante: "AUTORIZO_GERENTE", usuarioId: 7 },
    { rolFirmante: "ENTREGO_CUSTODIO", usuarioId: 7 },
    { rolFirmante: "RECIBIO_BENEFICIARIO", usuarioId: 9 },
  ]);

  // Estan los tres roles, pero quien autoriza no puede ser quien entrega.
  assert.deepEqual(estado.rolesFaltantes, []);
  assert.equal(estado.firmantesDuplicados, true);
  assert.equal(estado.completo, false);
});

test("estadoValeEgreso no confunde dos terceros presenciales con un firmante repetido", () => {
  // usuarioId null es "firmo un tercero en papel": son personas distintas
  // aunque el sistema no tenga una cuenta para ninguna de las dos.
  const estado = estadoValeEgreso([
    { rolFirmante: "AUTORIZO_GERENTE", usuarioId: 4 },
    { rolFirmante: "ENTREGO_CUSTODIO", usuarioId: null },
    { rolFirmante: "RECIBIO_BENEFICIARIO", usuarioId: null },
  ]);

  assert.equal(estado.firmantesDuplicados, false);
  assert.equal(estado.completo, true);
});

// ===== Regla 5 — el retiro de un socio es anticipo, no reparto =====

test("posicionSocio deja el retiro sin reparto como saldo por comprobar", () => {
  const posicion = posicionSocio({ totalAnticipos: "50000.00", totalRepartido: "0.00" });

  assert.deepEqual(posicion, {
    totalAnticipos: "50000.00",
    totalRepartido: "0.00",
    saldoPorComprobar: "50000.00",
    tieneSaldoPorComprobar: true,
    etiqueta: "Anticipo a cuenta de utilidades — saldo por comprobar",
  });
});

test("posicionSocio deja saldo por comprobar mientras el reparto no alcance", () => {
  const posicion = posicionSocio({ totalAnticipos: "50000.00", totalRepartido: "30000.00" });

  assert.equal(posicion!.saldoPorComprobar, "20000.00");
  assert.equal(posicion!.tieneSaldoPorComprobar, true);
});

test("posicionSocio marca respaldado cuando el reparto formal cubre los anticipos", () => {
  const posicion = posicionSocio({ totalAnticipos: "50000.00", totalRepartido: "50000.00" });

  assert.equal(posicion!.saldoPorComprobar, "0.00");
  assert.equal(posicion!.tieneSaldoPorComprobar, false);
  assert.equal(posicion!.etiqueta, "Respaldado por reparto formal de utilidades");
});

test("posicionSocio nunca presenta un saldo negativo", () => {
  // Un reparto mayor que lo retirado no vuelve al socio acreedor de la caja:
  // el saldo por comprobar se topa en cero, no se invierte.
  const posicion = posicionSocio({ totalAnticipos: "30000.00", totalRepartido: "80000.00" });

  assert.equal(posicion!.saldoPorComprobar, "0.00");
  assert.equal(posicion!.tieneSaldoPorComprobar, false);
  assert.equal(posicion!.totalRepartido, "80000.00");
});

test("posicionSocio devuelve null si alguno de los totales es ilegible", () => {
  assert.equal(posicionSocio({ totalAnticipos: "n/d", totalRepartido: "0" }), null);
  assert.equal(posicionSocio({ totalAnticipos: "0", totalRepartido: "1.005" }), null);
});

// ===== Regla 7 — la diferencia de caja se explica o no cierra el dia =====

test("arqueoCorte cuadra cuando lo contado coincide con el saldo calculado", () => {
  const arqueo = arqueoCorte({
    saldoInicial: "1000.00",
    totalIngresos: "5000.00",
    totalEgresos: "2000.00",
    efectivoContado: "4000.00",
  });

  assert.deepEqual(arqueo, {
    saldoCalculado: "4000.00",
    efectivoContado: "4000.00",
    diferencia: "0.00",
    cuadra: true,
    esFaltante: false,
    esSobrante: false,
    requiereExplicacion: false,
    severidadAlerta: "NINGUNA",
  });
});

test("arqueoCorte marca el faltante como GRAVE", () => {
  const arqueo = arqueoCorte({
    saldoInicial: "1000.00",
    totalIngresos: "5000.00",
    totalEgresos: "2000.00",
    efectivoContado: "3850.50",
  });

  assert.equal(arqueo!.saldoCalculado, "4000.00");
  assert.equal(arqueo!.diferencia, "-149.50");
  assert.equal(arqueo!.esFaltante, true);
  assert.equal(arqueo!.esSobrante, false);
  // Falta dinero en la caja: escala al Gerente General.
  assert.equal(arqueo!.severidadAlerta, "GRAVE");
});

test("arqueoCorte marca el sobrante solo como AVISO", () => {
  const arqueo = arqueoCorte({
    saldoInicial: "1000.00",
    totalIngresos: "5000.00",
    totalEgresos: "2000.00",
    efectivoContado: "4120.75",
  });

  assert.equal(arqueo!.diferencia, "120.75");
  assert.equal(arqueo!.esSobrante, true);
  assert.equal(arqueo!.esFaltante, false);
  assert.equal(arqueo!.severidadAlerta, "AVISO");
});

test("arqueoCorte pide explicacion exactamente cuando hay diferencia", () => {
  const casos = ["4000.00", "3999.99", "4000.01", "0.00", "9999.99"];

  for (const contado of casos) {
    const arqueo = arqueoCorte({
      saldoInicial: "1000.00",
      totalIngresos: "5000.00",
      totalEgresos: "2000.00",
      efectivoContado: contado,
    })!;

    assert.equal(
      arqueo.requiereExplicacion,
      !arqueo.cuadra,
      `requiereExplicacion no concuerda con cuadra al contar ${contado}`,
    );
    assert.equal(arqueo.cuadra, arqueo.diferencia === "0.00");
    assert.equal(arqueo.esFaltante && arqueo.esSobrante, false);
    assert.equal(
      arqueo.severidadAlerta === "NINGUNA",
      arqueo.cuadra,
      `la severidad no concuerda con cuadra al contar ${contado}`,
    );
  }
});

test("arqueoCorte detecta un centavo de diferencia en una caja de ocho digitos", () => {
  const arqueo = arqueoCorte({
    saldoInicial: "10000000.03",
    totalIngresos: "0.00",
    totalEgresos: "0.00",
    efectivoContado: "10000000.02",
  });

  assert.equal(arqueo!.diferencia, "-0.01");
  assert.equal(arqueo!.cuadra, false);
  assert.equal(arqueo!.severidadAlerta, "GRAVE");
});

test("arqueoCorte devuelve null si alguno de los cuatro importes es ilegible", () => {
  const base = {
    saldoInicial: "1000.00",
    totalIngresos: "5000.00",
    totalEgresos: "2000.00",
    efectivoContado: "4000.00",
  };

  for (const campo of Object.keys(base) as (keyof typeof base)[]) {
    assert.equal(arqueoCorte({ ...base, [campo]: "no contado" }), null, `${campo} debio rechazarse`);
  }
});

test("la explicacion de la diferencia respeta el minimo que exige la funcion SQL", () => {
  assert.equal(MINIMO_EXPLICACION_DIFERENCIA, 10);

  assert.equal(explicacionDiferenciaEsSuficiente(null), false);
  assert.equal(explicacionDiferenciaEsSuficiente(undefined), false);
  assert.equal(explicacionDiferenciaEsSuficiente(""), false);
  assert.equal(explicacionDiferenciaEsSuficiente("faltante"), false);
  // Los espacios no cuentan: se recortan antes de medir.
  assert.equal(explicacionDiferenciaEsSuficiente("          "), false);
  assert.equal(explicacionDiferenciaEsSuficiente("faltante!!"), true);
  assert.equal(
    explicacionDiferenciaEsSuficiente("Se pago un flete en efectivo sin vale"),
    true,
  );
});

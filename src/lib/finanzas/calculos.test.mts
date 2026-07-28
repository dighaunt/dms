import assert from "node:assert/strict";
import test from "node:test";

import {
  aCentavos,
  arqueoCorte,
  deCentavos,
  estadoValeEgreso,
  EXIGE_USUARIO_INTERNO_VALE,
  explicacionDiferenciaEsSuficiente,
  FIRMANTES_VALE_EGRESO,
  MINIMO_EXPLICACION_DIFERENCIA,
  posicionSocio,
  utilidadConsigna,
} from "./calculos.ts";

/**
 * QUÉ SE PRUEBA EN ESTE ARCHIVO, Y QUÉ NO.
 *
 * Todo lo de aquí es TypeScript puro y corre sin base de datos. Eso NO es
 * incidental: `calculos.ts` es el ESPEJO de las reglas —la reimplementación
 * que permite dibujar un número en pantalla antes de guardarlo—, y los
 * candados que de verdad sostienen el dinero son columnas GENERATED,
 * disparadores, índices únicos parciales y funciones plpgsql.
 *
 * Por eso los apartados de abajo no se titulan "Regla 3", "Regla 5" ni
 * "Regla 7" a secas, como estaban antes: leerlo así hacía pensar que la regla
 * estaba cubierta cuando lo cubierto era su copia. Si mañana alguien borrara
 * la palabra GENERATED de `utilidad_neta`, todo este archivo seguiría en
 * verde. La cobertura de los candados vive en `reglas-utilidad-egreso`,
 * `reglas-socios-corte`, `folios-firmas` y `antifraude`, que necesitan
 * `DATABASE_URL_TEST`.
 *
 * Probar el espejo sigue valiendo la pena: la aritmética en BigInt sobre
 * centavos es donde se pierde un peso sin que nadie lo note, y una pantalla
 * que anuncia un número distinto al que la base va a guardar es un problema
 * por derecho propio.
 */

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

// ===== Espejo de la regla 3 — `utilidadConsigna` =====
// El candado de la regla 3 es la columna GENERATED `utilidad_neta` y el trigger
// `gasto_rci03_recalcula`, y lo cubre `reglas-utilidad-egreso.test.mts`. Aquí
// se prueba que el número que la pantalla enseña antes de guardar sea el mismo
// que la base va a calcular.

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

// ===== Espejo de la regla 4 — `estadoValeEgreso` =====
// El candado de la regla 4 son las filas de `firma_requerida`, el índice único
// parcial (documento_id, usuario_id) y `rol_firmante.exige_usuario_interno`, y
// lo cubre `reglas-utilidad-egreso.test.mts`. Aquí se prueba que la pantalla
// pida las mismas tres firmas y rechace los mismos vales que la base.

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
    rolesSinUsuarioAtribuible: [],
  });
});

test("el espejo de quien firma con PIN y quien firma en papel es el de rol_firmante", () => {
  // Copia de `rol_firmante.exige_usuario_interno` (migración 034) para los tres
  // roles del vale. Que siga coincidiendo con la base lo comprueba
  // `reglas-utilidad-egreso.test.mts` preguntándoselo a Postgres; aquí sólo se
  // fija lo que este archivo da por supuesto en los casos de abajo.
  assert.deepEqual(EXIGE_USUARIO_INTERNO_VALE, {
    AUTORIZO_GERENTE: true,
    ENTREGO_CUSTODIO: true,
    RECIBIO_BENEFICIARIO: false,
  });

  // El beneficiario es el único de los tres que puede no tener cuenta: un
  // proveedor o un trabajador no son —ni deben ser— usuarios del sistema.
  assert.deepEqual(
    FIRMANTES_VALE_EGRESO.filter((rol) => !EXIGE_USUARIO_INTERNO_VALE[rol]),
    ["RECIBIO_BENEFICIARIO"],
  );
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
    rolesSinUsuarioAtribuible: [],
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
  assert.deepEqual(estado.rolesSinUsuarioAtribuible, []);
  assert.equal(estado.completo, false);
});

test("estadoValeEgreso da por completo el vale que firma en papel el beneficiario", () => {
  // El caso corriente del formato: el gerente y el custodio ponen su PIN, y
  // quien cobra —un proveedor, una trabajadora— rubrica de forma presencial
  // porque no tiene cuenta. `RECIBIO_BENEFICIARIO` es el único de los tres
  // roles con exige_usuario_interno = false, y por eso su usuarioId nulo es
  // legítimo y el vale queda completo.
  const estado = estadoValeEgreso([
    { rolFirmante: "AUTORIZO_GERENTE", usuarioId: 4 },
    { rolFirmante: "ENTREGO_CUSTODIO", usuarioId: 5 },
    { rolFirmante: "RECIBIO_BENEFICIARIO", usuarioId: null },
  ]);

  assert.deepEqual(estado, {
    completo: true,
    rolesFaltantes: [],
    firmantesDuplicados: false,
    rolesSinUsuarioAtribuible: [],
  });
});

test("estadoValeEgreso no completa el vale con un rol interno firmado sin usuario atribuible", () => {
  // Éste es el caso que la prueba anterior afirmaba AL REVÉS. Decía "no
  // confunde dos terceros presenciales con un firmante repetido" y montaba
  // ENTREGO_CUSTODIO sin usuario dando `completo: true`, pero ese vale no
  // puede existir: `ENTREGO_CUSTODIO` tiene exige_usuario_interno = true
  // (migración 034) y `firmar_documento_externo` lo rechaza con "El rol %
  // corresponde a personal de la empresa". Es decir, daba por bueno justo el
  // escenario que la migración 038 se escribió para cerrar: el custodio
  // declara haber entregado el efectivo y no hay forma de saber quién fue.
  const estado = estadoValeEgreso([
    { rolFirmante: "AUTORIZO_GERENTE", usuarioId: 4 },
    { rolFirmante: "ENTREGO_CUSTODIO", usuarioId: null },
    { rolFirmante: "RECIBIO_BENEFICIARIO", usuarioId: null },
  ]);

  assert.deepEqual(estado.rolesFaltantes, [], "los tres roles sí están presentes");
  // Dos nulos siguen sin ser "la misma persona firmando dos veces": eso era
  // cierto y se conserva. Lo que faltaba era la otra comprobación.
  assert.equal(estado.firmantesDuplicados, false);
  assert.deepEqual(estado.rolesSinUsuarioAtribuible, ["ENTREGO_CUSTODIO"]);
  assert.equal(estado.completo, false);
});

test("estadoValeEgreso señala cada rol interno sin usuario, en el orden del papel", () => {
  const estado = estadoValeEgreso([
    { rolFirmante: "AUTORIZO_GERENTE", usuarioId: null },
    { rolFirmante: "ENTREGO_CUSTODIO", usuarioId: null },
    { rolFirmante: "RECIBIO_BENEFICIARIO", usuarioId: 9 },
  ]);

  assert.deepEqual(estado.rolesSinUsuarioAtribuible, ["AUTORIZO_GERENTE", "ENTREGO_CUSTODIO"]);
  assert.equal(estado.completo, false);

  // Quien autoriza el gasto tampoco puede ser un nombre sin cuenta detrás: la
  // autorización del Gerente General es la que convierte el vale en orden de
  // pago, y sin usuario no señala a nadie.
  const soloGerente = estadoValeEgreso([
    { rolFirmante: "AUTORIZO_GERENTE", usuarioId: null },
    { rolFirmante: "ENTREGO_CUSTODIO", usuarioId: 5 },
    { rolFirmante: "RECIBIO_BENEFICIARIO", usuarioId: 6 },
  ]);
  assert.deepEqual(soloGerente.rolesSinUsuarioAtribuible, ["AUTORIZO_GERENTE"]);
  assert.equal(soloGerente.completo, false);
});

test("estadoValeEgreso no inventa reglas sobre un rol ajeno al vale", () => {
  // Un TESTIGO no es firmante del RCI-05: no está en `firma_requerida` para
  // este formato, así que la base ni siquiera lo admitiría. Que aparezca no
  // debe faltar ni sobrar nada, y menos aún inventar una exigencia que la
  // base no hace.
  const estado = estadoValeEgreso([...VALE_COMPLETO, { rolFirmante: "TESTIGO", usuarioId: null }]);

  assert.deepEqual(estado, {
    completo: true,
    rolesFaltantes: [],
    firmantesDuplicados: false,
    rolesSinUsuarioAtribuible: [],
  });
});

// ===== Espejo de la regla 5 — `posicionSocio` =====
// El candado de la regla 5 son la vista `v_anticipo_utilidades_socio`, el
// trigger `avisar_retiro_socio_sin_respaldo` y las tablas append-only del
// reparto, y lo cubre `reglas-socios-corte.test.mts`. Aquí se prueba la resta
// y la etiqueta con la que se presenta.

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

// ===== Espejo de la regla 7 — `arqueoCorte` =====
// El candado de la regla 7 son `armar_corte_caja` y `cerrar_corte_caja`, que
// se niega a cerrar el día con una diferencia sin explicar, y lo cubre
// `reglas-socios-corte.test.mts`. Aquí se prueba la aritmética del arqueo y la
// severidad con que se anuncia.

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

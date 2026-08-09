
import assert from "node:assert/strict";
import test from "node:test";

export const URL_PRUEBAS = process.env.DATABASE_URL_TEST;

export const SIN_BASE: string | false = URL_PRUEBAS ? false : "sin DATABASE_URL_TEST";

const NEGATIVOS = new Set(["", "0", "false", "no"]);
const SALTO_AUTORIZADO = !NEGATIVOS.has(
  (process.env.PERMITIR_PRUEBAS_SIN_BASE ?? "").trim().toLowerCase(),
);

const COMANDO_CON_BASE =
  'DATABASE_URL_TEST="postgresql://postgres@127.0.0.1:5433/finanzas_test" npm test';

function instrucciones(suite: string): string {
  return [
    "",
    `QUEDÓ SIN PROBAR: ${suite}.`,
    "",
    "Falta DATABASE_URL_TEST.",
    "",
    "Son pruebas de control interno de efectivo y lo que verifican vive en la",
    "base —CHECK, disparadores, índices únicos y funciones plpgsql—, no en",
    "TypeScript. Sin base no se prueba ninguno de esos candados.",
    "",
    "QUÉ HACER, según lo que hayas tocado:",
    "",
    "  · Finanzas, la base o las migraciones — corre la suite completa contra",
    "    una base de pruebas desechable:",
    "",
    `      ${COMANDO_CON_BASE}`,
    "",
    "    Si aún no la tienes, el README (sección «Pruebas») la levanta en tres",
    "    comandos: createdb, npm run db:migrate y esta misma línea.",
    "",
    "  · Sólo tocaste la UI u otro módulo y hoy no puedes levantar Postgres —",
    "    autoriza el salto de forma explícita. Las pruebas seguirán sin correr,",
    "    pero quedará dicho que decidiste no correrlas:",
    "",
    "      PERMITIR_PRUEBAS_SIN_BASE=1 npm test",
    "",
  ].join("\n");
}

export function centinelaDeBase(suite: string): void {
  if (URL_PRUEBAS) return;

  if (SALTO_AUTORIZADO) {
    test(`AVISO · queda SIN PROBAR ${suite} (salto autorizado con PERMITIR_PRUEBAS_SIN_BASE)`, () => {

      console.warn(
        `\n[finanzas] SIN COBERTURA: ${suite}. Salto autorizado con PERMITIR_PRUEBAS_SIN_BASE.\n` +
          `[finanzas] Para probarlo de verdad: ${COMANDO_CON_BASE}\n`,
      );
    });
    return;
  }

  test(`FALTA DATABASE_URL_TEST · queda SIN PROBAR ${suite}`, () => {
    assert.fail(instrucciones(suite));
  });
}

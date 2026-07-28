/**
 * Interruptor de las pruebas de Finanzas que necesitan Postgres, con centinela.
 *
 * ===== POR QUÉ EXISTE ESTE ARCHIVO =====
 *
 * Las suites de `antifraude`, `folios-firmas`, `reglas-socios-corte` y
 * `reglas-utilidad-egreso` son las únicas que tocan los candados reales del
 * módulo: los `CHECK`, los disparadores, los índices únicos parciales y las
 * funciones plpgsql donde vive el control interno del efectivo. Sin
 * `DATABASE_URL_TEST` no pueden correr, y hasta hoy se saltaban con un
 * `{ skip }` mudo: `npm test` terminaba con `fail 0` y daba la impresión de un
 * módulo probado cuando lo único ejecutado era aritmética en TypeScript. Un
 * salto silencioso sobre 44 pruebas de control interno es peor que no tenerlas,
 * porque tranquiliza.
 *
 * ===== POR QUÉ UN CENTINELA QUE FALLA, Y NO OTRA COSA =====
 *
 * Se consideraron cuatro mecanismos:
 *
 *  1. Fallo duro al importar el módulo (`throw` en el cuerpo). Es el más
 *     ruidoso, pero aborta el archivo antes de registrar un solo caso: el
 *     reporte no llega a decir CUÁNTAS pruebas se perdieron ni cuáles, y el
 *     mensaje sale como un error de carga, mezclado con el rastro de pila.
 *  2. Aviso por `console.warn` sin fallar. Es exactamente el problema de hoy
 *     con otro disfraz: la salida de `node --test` son cientos de líneas y un
 *     aviso a mitad de ellas se lee con lupa o no se lee. Además `npm test`
 *     seguiría saliendo en verde, que es lo que hay que romper.
 *  3. Quitar el `skip` y dejar que cada prueba reviente al conectar. Serían 44
 *     fallos con "ECONNREFUSED" y ninguna pista de qué hacer; y en CI el ruido
 *     taparía cualquier fallo verdadero.
 *  4. El elegido: UN caso centinela por suite que FALLA con instrucciones, más
 *     una variable —`PERMITIR_PRUEBAS_SIN_BASE`— que hay que declarar
 *     explícitamente para autorizar el salto.
 *
 * El centinela gana porque cumple las dos condiciones a la vez. Por un lado el
 * aviso es imposible de ignorar: `npm test` sale con código 1 y el resumen
 * dice `fail 4`, una por suite, con el nombre de lo que quedó sin cubrir en el
 * título del caso —ni siquiera hay que leer el detalle—. Por otro lado no deja
 * tirado a quien no tiene la culpa: el mensaje trae el comando exacto para
 * levantar la base Y el comando exacto para autorizar el salto, de modo que
 * quien sólo tocó una pantalla pueda seguir trabajando en un minuto. Ese salto
 * autorizado, además, deja de ser mudo: se registra un caso con "AVISO" en el
 * título, así que en la salida sigue viéndose qué no se probó.
 *
 * Que la autorización sea una variable explícita —y no el estado por omisión—
 * es el punto entero: mueve la decisión de "no probé los candados" de un
 * silencio del arranque a un acto deliberado que además queda escrito en el
 * comando que se tecleó.
 *
 * `DATABASE_URL_TEST` está documentada en `.env.example` y en el README
 * (sección "Pruebas"), que era el otro origen del hueco: la variable existía
 * en cuatro archivos de prueba y en ningún sitio más.
 */
import assert from "node:assert/strict";
import test from "node:test";

/** Cadena de conexión de la base desechable contra la que corren las suites. */
export const URL_PRUEBAS = process.env.DATABASE_URL_TEST;

/**
 * Valor que el runner de `node:test` espera en `{ skip }`: `false` para correr,
 * o el motivo del salto. Se mantiene el mismo nombre y la misma forma que
 * usaban los cuatro archivos para que el cambio sea el centinela y no una
 * reescritura de 44 casos.
 */
export const SIN_BASE: string | false = URL_PRUEBAS ? false : "sin DATABASE_URL_TEST";

/**
 * Sólo un valor afirmativo autoriza el salto. `0`, `false` y `no` se tratan
 * como "no autorizado" para que un `PERMITIR_PRUEBAS_SIN_BASE=0` heredado del
 * entorno no acabe apagando el centinela sin que nadie lo pidiera.
 */
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

/**
 * Registra el centinela de una suite que necesita base.
 *
 * Se llama una vez, arriba del archivo y antes de cualquier `test()`, para que
 * el aviso salga al principio de la salida y no sepultado entre los casos
 * saltados. Con base disponible no registra nada: la suite corre y el
 * centinela no tiene nada que anunciar.
 *
 * @param suite Qué queda sin cubrir, en palabras del manual. Es el texto que
 *              se lee en el resumen de fallos, así que dice la regla, no el
 *              nombre del archivo.
 */
export function centinelaDeBase(suite: string): void {
  if (URL_PRUEBAS) return;

  if (SALTO_AUTORIZADO) {
    test(`AVISO · queda SIN PROBAR ${suite} (salto autorizado con PERMITIR_PRUEBAS_SIN_BASE)`, () => {
      // A stderr y no como diagnóstico del runner: sobrevive a cualquier
      // reporter y se ve aunque la salida se esté canalizando a un archivo.
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

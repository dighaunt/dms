/**
 * Pruebas de integración del ciclo de vida documental: folio, firma y sello.
 *
 * Las tres cosas que se prueban aquí son las que convierten una captura en un
 * documento de control interno: un consecutivo sin huecos que nadie puede
 * reescribir, un juego de firmas que cierra el documento exactamente cuando
 * están las obligatorias, y un cuño tokenizado que permite verificar el papel
 * contra la base. Ninguna de las tres vive en TypeScript —son funciones
 * plpgsql, disparadores e índices únicos—, así que probarlas con dobles de
 * prueba sólo confirmaría que el doble hace lo que le pedimos. Por eso aquí se
 * habla con una base real y se invocan las funciones tal como las invoca la
 * capa de servicios.
 *
 * Aislamiento: cada caso abre su propia conexión, siembra DENTRO de una
 * transacción y termina en ROLLBACK. Es la única forma de que el consecutivo
 * de folios, la UNIQUE de la clave de sucursal y la UNIQUE del token de sello
 * no hagan que una prueba dependa de si otra corrió antes.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import pg from "pg";

import { centinelaDeBase, SIN_BASE, URL_PRUEBAS } from "./base-pruebas.mts";

// Sin base no hay nada que probar aquí, y callarlo dejaría `npm test` en verde
// con cero cobertura de las reglas 1 y 8. El porqué del mecanismo está en la
// cabecera de `base-pruebas.mts`.
centinelaDeBase("el ciclo de folio, firma y sello: reglas 1 y 8 del manual");

// ===== Actores =====
// El PIN se fija aquí y no se deriva del id: un id de seis dígitos truncaría
// cualquier derivación y la prueba fallaría por una razón que nada tiene que
// ver con lo que dice probar. El auxiliar no tiene PIN a propósito: es el
// contraste que exige la regla "firmar sin PIN dado de alta falla".
const ACTORES = {
  gerente: { email: "gerente@t.mx", nombre: "Gerente Prueba", pin: "100001" },
  custodio: { email: "custodio@t.mx", nombre: "Custodio Prueba", pin: "100002" },
  vendedor: { email: "vendedor@t.mx", nombre: "Vendedora Prueba", pin: "100003" },
  socio: { email: "socio@t.mx", nombre: "Socio Prueba", pin: "100004" },
  auxiliar: { email: "auxiliar@t.mx", nombre: "Auxiliar Sin Pin", pin: null },
} as const;

type Actor = keyof typeof ACTORES;

/** Para el actor sin PIN el valor da igual: la función falla antes de compararlo. */
const PIN_INEXISTENTE = "000000";

/**
 * Semilla mínima para hablar de folios y firmas: usuarios, DOS sucursales y un
 * empleado. Van dos sucursales porque el consecutivo corre por sucursal y con
 * una sola no habría manera de demostrarlo. No hacen falta unidades ni
 * expedientes: el ciclo de vida documental no los toca.
 */
const SEMILLA = `
INSERT INTO usuario (email, nombre, nivel) VALUES
 ('gerente@t.mx','Gerente Prueba','N3'),
 ('custodio@t.mx','Custodio Prueba','N2'),
 ('vendedor@t.mx','Vendedora Prueba','N1'),
 ('socio@t.mx','Socio Prueba','N3'),
 ('auxiliar@t.mx','Auxiliar Sin Pin','N1')
ON CONFLICT (email) DO NOTHING;

INSERT INTO sucursal (clave, nombre, creada_por) VALUES
 ('MTY','Matriz Monterrey',(SELECT id FROM usuario WHERE email='gerente@t.mx')),
 ('GDL','Sucursal Guadalajara',(SELECT id FROM usuario WHERE email='gerente@t.mx'))
ON CONFLICT (clave) DO NOTHING;

INSERT INTO empleado (num_empleado, nombres, apellido_paterno, apellido_materno, puesto, sucursal_id, usuario_id, creado_por) VALUES
 ('E-01','Vendedora','Prueba',NULL,'Vendedor',(SELECT id FROM sucursal WHERE clave='MTY'),
  (SELECT id FROM usuario WHERE email='vendedor@t.mx'),(SELECT id FROM usuario WHERE email='gerente@t.mx'))
ON CONFLICT (sucursal_id, num_empleado) DO NOTHING;
`;

/** Los identificadores son bigint y el driver los entrega como texto; se dejan así. */
type Escenario = {
  cx: pg.Client;
  usuarios: Record<Actor, string>;
  sucursalMty: string;
  sucursalGdl: string;
  empleadoVendedor: string;
};

async function conEscenario(cuerpo: (esc: Escenario) => Promise<void>): Promise<void> {
  const cx = new pg.Client({ connectionString: URL_PRUEBAS });
  await cx.connect();
  try {
    await cx.query("BEGIN");
    await cx.query("SET search_path TO traza, public");
    await cx.query(SEMILLA);

    const usuarios = {} as Record<Actor, string>;
    for (const [actor, datos] of Object.entries(ACTORES) as [Actor, (typeof ACTORES)[Actor]][]) {
      const { rows } = await cx.query<{ id: string }>("SELECT id FROM usuario WHERE email = $1", [
        datos.email,
      ]);
      usuarios[actor] = rows[0].id;
      if (datos.pin !== null) {
        await cx.query("SELECT establecer_pin_firma($1, $2)", [rows[0].id, datos.pin]);
      }
    }

    const sucursales = await cx.query<{ id: string; clave: string }>(
      "SELECT id, clave FROM sucursal WHERE clave IN ('MTY','GDL')",
    );
    const empleado = await cx.query<{ id: string }>(
      "SELECT id FROM empleado WHERE num_empleado = 'E-01'",
    );

    await cuerpo({
      cx,
      usuarios,
      sucursalMty: sucursales.rows.filter((s) => s.clave === "MTY")[0].id,
      sucursalGdl: sucursales.rows.filter((s) => s.clave === "GDL")[0].id,
      empleadoVendedor: empleado.rows[0].id,
    });
  } finally {
    // ROLLBACK y nunca COMMIT: es lo que hace repetible una prueba que consume
    // folios consecutivos, claves de sucursal únicas y tokens de sello únicos.
    await cx.query("ROLLBACK").catch(() => undefined);
    await cx.end();
  }
}

type ErrorPostgres = Error & { code?: string; constraint?: string };

/**
 * Ejecuta algo que DEBE ser rechazado por la base.
 *
 * El SAVEPOINT no es adorno: en Postgres cualquier error aborta la transacción
 * completa, y sin él la prueba no podría seguir comprobando nada después del
 * primer rechazo.
 */
async function rechaza(
  esc: Escenario,
  accion: () => Promise<unknown>,
  esperado: { codigo?: string; mensaje?: RegExp; restriccion?: RegExp },
): Promise<void> {
  await esc.cx.query("SAVEPOINT antes_del_rechazo");
  let error: ErrorPostgres | null = null;
  try {
    await accion();
  } catch (e) {
    error = e as ErrorPostgres;
  }
  await esc.cx.query("ROLLBACK TO SAVEPOINT antes_del_rechazo");

  assert.ok(error, "se esperaba que la base rechazara la operación y la aceptó");
  if (esperado.codigo) {
    assert.equal(error.code, esperado.codigo, `mensaje recibido: ${error.message}`);
  }
  if (esperado.mensaje) assert.match(error.message, esperado.mensaje);
  if (esperado.restriccion) assert.match(error.constraint ?? "", esperado.restriccion);
}

// ===== Utilidades de armado =====

/**
 * El hash de contenido es la huella de lo que quien firma tuvo delante.
 *
 * Depende SÓLO del documento, nunca del rol ni de quién firma: dos personas
 * que firman el mismo folio firman lo mismo, o no están firmando lo mismo.
 * Desde la migración 039 eso no es una convención de la prueba sino un
 * candado —el disparador `firma_exige_mismo_contenido` rechaza la segunda
 * firma cuya huella no coincida con la de la primera—, y era el hueco que más
 * pesaba de la auditoría: el único punto donde se podía cambiar una cifra ya
 * consentida sin dejar rastro.
 *
 * Los sellos son otra cosa y su hash sí varía por acción: un sello acredita un
 * hecho del expediente, no el consentimiento de una persona.
 */
function hashDe(...partes: string[]): string {
  return createHash("sha256").update(partes.join("|")).digest("hex");
}

async function emitirFolio(
  esc: Escenario,
  tipo: string,
  actor: Actor,
  opciones: { sucursalId?: string; complementaA?: string } = {},
): Promise<string> {
  const { rows } = await esc.cx.query<{ id: string }>(
    "SELECT id FROM emitir_folio_financiero($1, $2, $3, $4)",
    [
      tipo,
      opciones.sucursalId ?? esc.sucursalMty,
      esc.usuarios[actor],
      opciones.complementaA ?? null,
    ],
  );
  return rows[0].id;
}

type FilaFolio = {
  folio: string;
  folio_completo: string;
  consecutivo: number;
  estado: string;
  estado_motivo: string | null;
  complementa_a: string | null;
  complementado_por: string | null;
};

async function folioDe(esc: Escenario, documentoId: string): Promise<FilaFolio> {
  const { rows } = await esc.cx.query<FilaFolio>(
    `SELECT folio, folio_completo, consecutivo, estado, estado_motivo,
            complementa_a, complementado_por
       FROM v_documento_financiero WHERE id = $1`,
    [documentoId],
  );
  return rows[0];
}

async function estadoDe(esc: Escenario, documentoId: string): Promise<string> {
  const { rows } = await esc.cx.query<{ estado: string }>(
    "SELECT estado_documento_fin($1) AS estado",
    [documentoId],
  );
  return rows[0].estado;
}

async function cambiarEstado(
  esc: Escenario,
  documentoId: string,
  hacia: string,
  actor: Actor,
  motivo: string | null = null,
): Promise<void> {
  await esc.cx.query("SELECT cambiar_estado_documento_fin($1, $2, $3, $4)", [
    documentoId,
    hacia,
    esc.usuarios[actor],
    motivo,
  ]);
}

async function mandarAFirma(esc: Escenario, documentoId: string, actor: Actor): Promise<void> {
  await cambiarEstado(esc, documentoId, "PENDIENTE_DE_FIRMA", actor);
}

async function firmarInterno(
  esc: Escenario,
  documentoId: string,
  rol: string,
  actor: Actor,
  // `hash` sólo lo pasa el caso que prueba el candado de contenido: en el uso
  // normal la huella es la del documento y no se elige.
  opciones: { pin?: string; hash?: string } = {},
): Promise<string> {
  const { rows } = await esc.cx.query<{ estado: string }>(
    "SELECT firmar_documento_financiero($1, $2, $3, $4, $5, $6) AS estado",
    [
      documentoId,
      rol,
      esc.usuarios[actor],
      opciones.pin ?? ACTORES[actor].pin ?? PIN_INEXISTENTE,
      opciones.hash ?? hashDe(documentoId),
      "prueba",
    ],
  );
  return rows[0].estado;
}

async function firmarPresencial(
  esc: Escenario,
  documentoId: string,
  rol: string,
  nombre: string,
  atestigua: Actor,
): Promise<string> {
  const { rows } = await esc.cx.query<{ estado: string }>(
    `SELECT firmar_documento_externo($1, $2, $3, 'INE', 'IDMX0099887', $4, $5, $6, NULL, 'prueba') AS estado`,
    [
      documentoId,
      rol,
      nombre,
      esc.usuarios[atestigua],
      ACTORES[atestigua].pin ?? PIN_INEXISTENTE,
      hashDe(documentoId),
    ],
  );
  return rows[0].estado;
}

/**
 * Captura la Parte I del RCI-01 y su desglose de denominaciones, dejando el
 * folio en BORRADOR.
 *
 * Va aparte de `reciboParaFirmar` porque desde la migración 039 el contenido
 * dejó de ser opcional: `cambiar_estado_documento_fin` no manda a firma un
 * formato en blanco (hueco H10). Los casos que necesitan mirar el folio
 * mientras todavía está en borrador tienen que capturar igual, y esto es lo
 * que les permite hacerlo sin repetir el INSERT.
 */
async function capturarRecibo(esc: Escenario, documentoId: string): Promise<void> {
  await esc.cx.query(
    `INSERT INTO recibo_caja_rci01
       (documento_id, vendedor_empleado_id, vendedor_id_tipo, vendedor_id_numero,
        cliente_nombre, fecha_hora_cobro, folio_venta_texto, concepto_codigo, importe_total)
     VALUES ($1, $2, 'INE', 'IDMX1122334', 'Cliente de Mostrador', now(), 'VTA-2026-0088',
             'ENGANCHE', $3)`,
    [documentoId, esc.empleadoVendedor, "5000.00"],
  );
  await esc.cx.query(
    "INSERT INTO denominacion_rci01 (documento_id, denominacion, cantidad) VALUES ($1, $2, $3)",
    [documentoId, "1000.00", 5],
  );

  // Lo mismo que hace el servicio antes de mandar a firma: el desglose tiene
  // que sumar el importe declarado o el arqueo no es tal.
  await esc.cx.query("SELECT validar_arqueo_rci01($1)", [documentoId]);
}

/** Folio de RCI-01 con su Parte I y su arqueo cuadrado, listo para firmarse. */
async function reciboParaFirmar(
  esc: Escenario,
  opciones: { sucursalId?: string } = {},
): Promise<string> {
  const documentoId = await emitirFolio(esc, "CACM-RCI-01", "vendedor", opciones);
  await capturarRecibo(esc, documentoId);
  await mandarAFirma(esc, documentoId, "vendedor");
  return documentoId;
}

/** Vale de egreso con su contenido capturado, listo para sus tres firmas. */
async function valeParaFirmar(esc: Escenario): Promise<string> {
  const documentoId = await emitirFolio(esc, "CACM-RCI-05", "custodio");
  await esc.cx.query(
    `INSERT INTO vale_egreso_rci05
       (documento_id, fecha_hora, concepto_codigo, beneficiario_nombre, beneficiario_id_tipo,
        beneficiario_id_numero, forma_pago, importe)
     VALUES ($1, now(), 'COMISION_VENDEDOR', 'Vendedora Prueba', 'INE', 'IDMX7654321',
             'EFECTIVO', '5000.00')`,
    [documentoId],
  );
  await mandarAFirma(esc, documentoId, "custodio");
  return documentoId;
}

/** Las dos firmas obligatorias del RCI-01; el TESTIGO es opcional y se omite. */
async function firmarRecibo(esc: Escenario, documentoId: string): Promise<void> {
  await firmarInterno(esc, documentoId, "ENTREGO_VENDEDOR", "vendedor");
  const estado = await firmarInterno(esc, documentoId, "RECIBIO_CUSTODIO", "custodio");
  assert.equal(estado, "FIRMADO", "el recibo debía quedar firmado con sus dos obligatorias");
}

/**
 * RCI-01 completo y FIRMADO: Parte I capturada, arqueo cuadrado y las dos
 * firmas obligatorias.
 *
 * Antes emitía el folio y lo mandaba a firma sin capturar nada, con el
 * argumento de que lo que se probaba era el folio y no el contenido. Ese
 * atajo montaba exactamente el hueco H10 de la auditoría —folio consumido,
 * sellado y con cero contenido— y desde la migración 039 ya no se puede:
 * `cambiar_estado_documento_fin` se niega a mandar a firma un formato en
 * blanco. Se reutiliza `reciboParaFirmar` porque un folio firmado de verdad
 * sirve igual para probar el folio y además no depende de un estado que la
 * base ya declaró imposible.
 */
async function reciboFirmado(
  esc: Escenario,
  opciones: { sucursalId?: string } = {},
): Promise<string> {
  const documentoId = await reciboParaFirmar(esc, opciones);
  await firmarRecibo(esc, documentoId);
  return documentoId;
}

type FilaSello = {
  accion_codigo: string;
  rol_firmante: string | null;
  token: string;
  estampado_por: string;
  hash_contenido: string;
};

async function sellosDe(esc: Escenario, documentoId: string): Promise<FilaSello[]> {
  const { rows } = await esc.cx.query<FilaSello>(
    `SELECT accion_codigo, rol_firmante, token, estampado_por, hash_contenido
       FROM sello_accion WHERE documento_id = $1 ORDER BY id`,
    [documentoId],
  );
  return rows;
}

async function estamparSello(
  esc: Escenario,
  documentoId: string,
  accion: string,
  actor: Actor,
  rol: string | null = null,
): Promise<string> {
  const { rows } = await esc.cx.query<{ token: string }>(
    "SELECT estampar_sello($1, $2, $3, $4, $5) AS token",
    [documentoId, accion, esc.usuarios[actor], hashDe(documentoId, accion), rol],
  );
  return rows[0].token;
}

async function bienFormado(esc: Escenario, token: string | null): Promise<boolean> {
  const { rows } = await esc.cx.query<{ ok: boolean }>(
    "SELECT token_sello_bien_formado($1) AS ok",
    [token],
  );
  return rows[0].ok;
}

// Misma clase de caracteres que el CHECK de sello_accion: base32 de Crockford,
// sin I, L, O ni U para que nadie confunda un uno con una ele al transcribir.
const FORMATO_TOKEN = /^CACM-[0-9A-HJ-KMNP-TV-Z]{4}-[0-9A-HJ-KMNP-TV-Z]{4}-[0-9A-HJ-KMNP-TV-Z]{4}$/;
const ALFABETO_TOKEN = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * Simula el error de transcripción: cambia el PRIMER carácter del cuerpo por
 * el siguiente del alfabeto. Se elige el primero porque el verificador pondera
 * por posición (peso 1), y con peso 1 ningún cambio de un solo carácter puede
 * dejar la suma igual módulo 32: el token alterado siempre tiene que fallar.
 */
function alterarUnCaracter(token: string): string {
  const posicion = "CACM-".length;
  const original = token[posicion];
  const siguiente = ALFABETO_TOKEN[(ALFABETO_TOKEN.indexOf(original) + 1) % ALFABETO_TOKEN.length];
  return token.slice(0, posicion) + siguiente + token.slice(posicion + 1);
}

// =====================================================================
// FOLIOS — el consecutivo es la prueba de que no falta ni sobra un papel
// =====================================================================

test(
  "folios: el consecutivo corre por sucursal y por tipo, cada uno con su propio 0001",
  { skip: SIN_BASE },
  async () => {
    await conEscenario(async (esc) => {
      const reciboMty = await emitirFolio(esc, "CACM-RCI-01", "vendedor");
      const reciboGdl = await emitirFolio(esc, "CACM-RCI-01", "vendedor", {
        sucursalId: esc.sucursalGdl,
      });
      const valeMty = await emitirFolio(esc, "CACM-RCI-05", "custodio");

      // Tres contadores independientes, tres números uno.
      assert.equal((await folioDe(esc, reciboMty)).consecutivo, 1);
      assert.equal((await folioDe(esc, reciboGdl)).consecutivo, 1);
      assert.equal((await folioDe(esc, valeMty)).consecutivo, 1);

      // El folio impreso se repite entre agencias —así es el papel— y por eso
      // existe folio_completo: es lo único que identifica sin ambigüedad.
      assert.equal((await folioDe(esc, reciboMty)).folio, "CACM-RCI-01-0001");
      assert.equal((await folioDe(esc, reciboGdl)).folio, "CACM-RCI-01-0001");
      assert.equal((await folioDe(esc, reciboMty)).folio_completo, "CACM-RCI-01-MTY-0001");
      assert.equal((await folioDe(esc, reciboGdl)).folio_completo, "CACM-RCI-01-GDL-0001");
      assert.equal((await folioDe(esc, valeMty)).folio, "CACM-RCI-05-0001");

      // Lo que emite una sucursal no adelanta el contador de la otra.
      assert.equal((await folioDe(esc, await emitirFolio(esc, "CACM-RCI-01", "vendedor"))).folio_completo,
        "CACM-RCI-01-MTY-0002");
      const segundoGdl = await emitirFolio(esc, "CACM-RCI-01", "vendedor", {
        sucursalId: esc.sucursalGdl,
      });
      assert.equal((await folioDe(esc, segundoGdl)).folio_completo, "CACM-RCI-01-GDL-0002");
    });
  },
);

test(
  "folios: tres folios seguidos son 1, 2 y 3 sin huecos",
  { skip: SIN_BASE },
  async () => {
    await conEscenario(async (esc) => {
      const documentos: string[] = [];
      for (let i = 0; i < 3; i += 1) {
        documentos.push(await emitirFolio(esc, "CACM-RCI-01", "vendedor"));
      }

      const consecutivos = [];
      for (const documento of documentos) consecutivos.push((await folioDe(esc, documento)).consecutivo);
      assert.deepEqual(consecutivos, [1, 2, 3]);

      // El contador no va por delante de lo emitido: si lo estuviera, existiría
      // un número entregado que ningún documento reclama.
      const { rows } = await esc.cx.query<{ ultimo: number; emitidos: string }>(
        `SELECT c.ultimo,
                (SELECT count(*)::text FROM documento_financiero d
                  WHERE d.tipo_codigo = c.tipo_codigo AND d.sucursal_id = c.sucursal_id) AS emitidos
           FROM contador_folio_financiero c
          WHERE c.tipo_codigo = 'CACM-RCI-01' AND c.sucursal_id = $1`,
        [esc.sucursalMty],
      );
      assert.equal(rows[0].ultimo, 3);
      assert.equal(rows[0].emitidos, "3");
    });
  },
);

test(
  "folios: un folio cancelado conserva su número y exige un motivo de al menos 10 caracteres",
  { skip: SIN_BASE },
  async () => {
    await conEscenario(async (esc) => {
      const primero = await emitirFolio(esc, "CACM-RCI-01", "vendedor");
      const abandonado = await emitirFolio(esc, "CACM-RCI-01", "vendedor");

      // Nueve caracteres: un folio anulado sin explicación es exactamente el
      // hueco que el consecutivo pretende impedir.
      await rechaza(esc, () => cambiarEstado(esc, abandonado, "CANCELADO", "gerente", "duplicado"), {
        codigo: "P0001",
        mensaje: /exige explicar/i,
      });
      await rechaza(esc, () => cambiarEstado(esc, abandonado, "CANCELADO", "gerente", null), {
        codigo: "P0001",
        mensaje: /exige explicar/i,
      });

      const motivo = "Se capturo por duplicado el cobro del cliente de mostrador";
      await cambiarEstado(esc, abandonado, "CANCELADO", "gerente", motivo);

      const cancelado = await folioDe(esc, abandonado);
      assert.equal(cancelado.estado, "CANCELADO");
      assert.equal(cancelado.estado_motivo, motivo);
      // El folio sigue ocupado y visible: es la forma de papel inutilizada que
      // se archiva en vez de tirarse.
      assert.equal(cancelado.consecutivo, 2);

      const siguiente = await emitirFolio(esc, "CACM-RCI-01", "vendedor");
      assert.equal((await folioDe(esc, siguiente)).consecutivo, 3);
      assert.equal((await folioDe(esc, primero)).consecutivo, 1);

      // Y el papel anulado se ve anulado: lleva su cuño de cancelación.
      const sellos = await sellosDe(esc, abandonado);
      assert.deepEqual(
        sellos.map((s) => s.accion_codigo),
        ["FOLIO_CANCELADO"],
      );
    });
  },
);

test(
  "folios: el complementario hereda tipo y sucursal, y un original sólo se complementa una vez",
  { skip: SIN_BASE },
  async () => {
    await conEscenario(async (esc) => {
      const original = await reciboFirmado(esc);

      await rechaza(
        esc,
        () => emitirFolio(esc, "CACM-RCI-05", "custodio", { complementaA: original }),
        { codigo: "P0001", mensaje: /mismo tipo/i },
      );
      await rechaza(
        esc,
        () =>
          emitirFolio(esc, "CACM-RCI-01", "custodio", {
            sucursalId: esc.sucursalGdl,
            complementaA: original,
          }),
        { codigo: "P0001", mensaje: /misma sucursal/i },
      );

      const complementario = await emitirFolio(esc, "CACM-RCI-01", "custodio", {
        complementaA: original,
      });
      // La corrección no tacha nada: es un folio nuevo que apunta al original.
      assert.equal((await folioDe(esc, complementario)).complementa_a, original);
      assert.equal((await folioDe(esc, complementario)).consecutivo, 2);
      assert.equal((await folioDe(esc, original)).complementado_por, complementario);
      assert.equal((await folioDe(esc, original)).estado, "FIRMADO");

      // Dos ramas sobre el mismo original dejarían dos verdades sobre el mismo
      // hecho; encadenar correcciones (C -> B -> A) sí se permite.
      await rechaza(
        esc,
        () => emitirFolio(esc, "CACM-RCI-01", "custodio", { complementaA: original }),
        { codigo: "23505", restriccion: /complementa_a/ },
      );
    });
  },
);

test(
  "folios: sólo se complementa un documento ya firmado",
  { skip: SIN_BASE },
  async () => {
    await conEscenario(async (esc) => {
      const original = await emitirFolio(esc, "CACM-RCI-01", "vendedor");
      // El contenido se captura desde el borrador: sin él la 039 no deja
      // mandarlo a firma, y lo que este caso mira es el estado, no el arqueo.
      await capturarRecibo(esc, original);

      // En borrador no hay nada que corregir sin tachaduras: se corrige encima.
      await rechaza(
        esc,
        () => emitirFolio(esc, "CACM-RCI-01", "custodio", { complementaA: original }),
        { codigo: "P0001", mensaje: /ya firmado/i },
      );

      await mandarAFirma(esc, original, "vendedor");
      await firmarInterno(esc, original, "ENTREGO_VENDEDOR", "vendedor");
      assert.equal(await estadoDe(esc, original), "PENDIENTE_DE_FIRMA");
      await rechaza(
        esc,
        () => emitirFolio(esc, "CACM-RCI-01", "custodio", { complementaA: original }),
        { codigo: "P0001", mensaje: /ya firmado/i },
      );

      // Completadas las firmas, el mismo original sí admite complementario: el
      // candado era el estado y nada más.
      await firmarInterno(esc, original, "RECIBIO_CUSTODIO", "custodio");
      const complementario = await emitirFolio(esc, "CACM-RCI-01", "custodio", {
        complementaA: original,
      });
      assert.equal((await folioDe(esc, complementario)).complementa_a, original);
    });
  },
);

// =====================================================================
// FIRMAS — el PIN, las obligatorias y la máquina de estados
// =====================================================================

test(
  "firmas: sin PIN dado de alta falla, con PIN incorrecto falla, con el correcto pasa",
  { skip: SIN_BASE },
  async () => {
    await conEscenario(async (esc) => {
      const documentoId = await reciboParaFirmar(esc);

      // Tener la sesión abierta no basta: el auxiliar existe y está activo,
      // pero nunca dio de alta su PIN.
      await rechaza(esc, () => firmarInterno(esc, documentoId, "ENTREGO_VENDEDOR", "auxiliar"), {
        codigo: "P0001",
        mensaje: /PIN de firma dado de alta/i,
      });

      await rechaza(
        esc,
        () => firmarInterno(esc, documentoId, "ENTREGO_VENDEDOR", "vendedor", { pin: "999999" }),
        { codigo: "P0001", mensaje: /no coincide/i },
      );

      assert.equal(
        await firmarInterno(esc, documentoId, "ENTREGO_VENDEDOR", "vendedor"),
        "PENDIENTE_DE_FIRMA",
      );

      // El PIN no toca la base en claro: lo que se guarda es el hash bcrypt.
      const { rows } = await esc.cx.query<{ pin_hash: string }>(
        "SELECT pin_hash FROM usuario_pin WHERE usuario_id = $1",
        [esc.usuarios.vendedor],
      );
      assert.match(rows[0].pin_hash, /^\$2[aby]?\$/);
      assert.notEqual(rows[0].pin_hash, ACTORES.vendedor.pin);

      // Y el alta del PIN tiene su propio formato: cuatro dígitos no son PIN.
      await rechaza(
        esc,
        () => esc.cx.query("SELECT establecer_pin_firma($1, $2)", [esc.usuarios.auxiliar, "1234"]),
        { codigo: "P0001", mensaje: /6 y 12 digitos/i },
      );
    });
  },
);

test(
  "firmas: el documento pasa a FIRMADO al completarse las obligatorias, sin necesitar al testigo",
  { skip: SIN_BASE },
  async () => {
    await conEscenario(async (esc) => {
      const conTestigo = await reciboParaFirmar(esc);

      // El testigo firma primero y NO mueve el estado: es opcional, así que su
      // rúbrica no puede adelantar ni retrasar el cierre del documento.
      assert.equal(
        await firmarPresencial(esc, conTestigo, "TESTIGO", "Testigo de Mostrador", "gerente"),
        "PENDIENTE_DE_FIRMA",
      );
      assert.equal(
        await firmarInterno(esc, conTestigo, "ENTREGO_VENDEDOR", "vendedor"),
        "PENDIENTE_DE_FIRMA",
      );
      assert.equal(
        await firmarInterno(esc, conTestigo, "RECIBIO_CUSTODIO", "custodio"),
        "FIRMADO",
      );
      assert.equal(await estadoDe(esc, conTestigo), "FIRMADO");

      // Y el mismo formato sin testigo cierra igual, con dos firmas.
      const sinTestigo = await reciboParaFirmar(esc);
      assert.equal(
        await firmarInterno(esc, sinTestigo, "ENTREGO_VENDEDOR", "vendedor"),
        "PENDIENTE_DE_FIRMA",
      );
      assert.equal(await firmarInterno(esc, sinTestigo, "RECIBIO_CUSTODIO", "custodio"), "FIRMADO");

      const { rows } = await esc.cx.query<{ total: string }>(
        "SELECT count(*)::text AS total FROM firma_documento_financiero WHERE documento_id = $1",
        [sinTestigo],
      );
      assert.equal(rows[0].total, "2");

      // Ya firmado, ni siquiera el rol opcional puede agregarse: el documento
      // cerrado sólo se corrige con un complementario.
      await rechaza(
        esc,
        () => firmarPresencial(esc, sinTestigo, "TESTIGO", "Testigo Tardio", "gerente"),
        { codigo: "P0001", mensaje: /ya esta firmado/i },
      );
    });
  },
);

test(
  "firmas: tras FIRMADO el contenido del detalle no admite UPDATE",
  { skip: SIN_BASE },
  async () => {
    await conEscenario(async (esc) => {
      const documentoId = await reciboParaFirmar(esc);
      await firmarRecibo(esc, documentoId);

      await rechaza(
        esc,
        () =>
          esc.cx.query("UPDATE recibo_caja_rci01 SET importe_total = $1 WHERE documento_id = $2", [
            "50000.00",
            documentoId,
          ]),
        { codigo: "P0001", mensaje: /no admite cambios/i },
      );

      // El arqueo tampoco: cambiar el desglose descuadraría lo ya firmado.
      await rechaza(
        esc,
        () =>
          esc.cx.query(
            "UPDATE denominacion_rci01 SET cantidad = 9 WHERE documento_id = $1",
            [documentoId],
          ),
        { codigo: "P0001", mensaje: /no admite cambios/i },
      );
      await rechaza(
        esc,
        () =>
          esc.cx.query(
            "INSERT INTO denominacion_rci01 (documento_id, denominacion, cantidad) VALUES ($1, $2, $3)",
            [documentoId, "500.00", 2],
          ),
        { codigo: "P0001", mensaje: /no admite cambios/i },
      );
      await rechaza(
        esc,
        () => esc.cx.query("DELETE FROM recibo_caja_rci01 WHERE documento_id = $1", [documentoId]),
        { codigo: "P0001", mensaje: /no admite cambios/i },
      );

      const { rows } = await esc.cx.query<{ importe_total: string; suma: string }>(
        `SELECT r.importe_total,
                (SELECT sum(subtotal)::text FROM denominacion_rci01 d WHERE d.documento_id = r.documento_id) AS suma
           FROM recibo_caja_rci01 r WHERE r.documento_id = $1`,
        [documentoId],
      );
      assert.equal(rows[0].importe_total, "5000.00");
      assert.equal(rows[0].suma, "5000.00");
    });
  },
);

test(
  "firmas: la máquina de estados no admite el salto de BORRADOR a FIRMADO",
  { skip: SIN_BASE },
  async () => {
    await conEscenario(async (esc) => {
      const documentoId = await emitirFolio(esc, "CACM-RCI-01", "vendedor");
      assert.equal(await estadoDe(esc, documentoId), "BORRADOR");
      // Capturar no cambia el estado; sólo hace posible el paso legítimo que
      // este caso recorre más abajo.
      await capturarRecibo(esc, documentoId);
      assert.equal(await estadoDe(esc, documentoId), "BORRADOR");

      // Declarar un documento firmado sin firmas es justo lo que la máquina
      // impide: FIRMADO no se pide desde fuera, lo concede la última firma.
      await rechaza(esc, () => cambiarEstado(esc, documentoId, "FIRMADO", "gerente"), {
        codigo: "P0001",
        mensaje: /BORRADOR no puede pasar a FIRMADO/i,
      });
      await rechaza(esc, () => firmarInterno(esc, documentoId, "ENTREGO_VENDEDOR", "vendedor"), {
        codigo: "P0001",
        mensaje: /pendiente de firma/i,
      });

      // El camino legítimo, incluida la vuelta atrás para corregir un error
      // detectado antes de firmar.
      await mandarAFirma(esc, documentoId, "vendedor");
      await cambiarEstado(esc, documentoId, "BORRADOR", "vendedor");
      assert.equal(await estadoDe(esc, documentoId), "BORRADOR");
      await mandarAFirma(esc, documentoId, "vendedor");
      await firmarRecibo(esc, documentoId);

      // Un documento firmado ya no retrocede ni se cancela.
      await rechaza(
        esc,
        () =>
          cambiarEstado(esc, documentoId, "CANCELADO", "gerente", "El cliente se arrepintio hoy"),
        { codigo: "P0001", mensaje: /FIRMADO no puede pasar a CANCELADO/i },
      );
      await rechaza(esc, () => cambiarEstado(esc, documentoId, "BORRADOR", "gerente"), {
        codigo: "P0001",
        mensaje: /FIRMADO no puede pasar a BORRADOR/i,
      });

      // El estado es historial append-only: el recorrido completo queda escrito.
      const { rows } = await esc.cx.query<{ estado: string }>(
        `SELECT estado FROM documento_financiero_estado_hist
          WHERE documento_id = $1 ORDER BY ocurrido_en`,
        [documentoId],
      );
      assert.deepEqual(
        rows.map((r) => r.estado),
        ["BORRADOR", "PENDIENTE_DE_FIRMA", "BORRADOR", "PENDIENTE_DE_FIRMA", "FIRMADO"],
      );
    });
  },
);

test(
  "firmas: cambiar el contenido entre una firma y la siguiente frena la segunda",
  { skip: SIN_BASE },
  async () => {
    await conEscenario(async (esc) => {
      const documentoId = await reciboParaFirmar(esc);
      const huellaOriginal = hashDe(documentoId);

      // La vendedora firma un recibo de 5,000: eso es lo que consintió.
      await firmarInterno(esc, documentoId, "ENTREGO_VENDEDOR", "vendedor");

      // Y entre su firma y la del custodio alguien baja la cifra. El arqueo se
      // deja cuadrado a propósito —tres billetes de mil para tres mil— para
      // que la maniobra no la delate `validar_arqueo_rci01` sino el candado de
      // contenido, que es el que se está probando.
      await esc.cx.query(
        "UPDATE recibo_caja_rci01 SET importe_total = '3000.00' WHERE documento_id = $1",
        [documentoId],
      );
      await esc.cx.query("UPDATE denominacion_rci01 SET cantidad = 3 WHERE documento_id = $1", [
        documentoId,
      ]);
      await esc.cx.query("SELECT validar_arqueo_rci01($1)", [documentoId]);

      // La segunda firma se niega, y el mensaje nombra a quien ya había
      // firmado: quien opera tiene que saber a quién se le movió el papel.
      await rechaza(
        esc,
        () =>
          firmarInterno(esc, documentoId, "RECIBIO_CUSTODIO", "custodio", {
            hash: hashDe(documentoId, "3000.00"),
          }),
        { codigo: "P0001", mensaje: /no es lo que esa persona consinti/i },
      );
      assert.equal(await estadoDe(esc, documentoId), "PENDIENTE_DE_FIRMA");

      // Restituido el contenido, el camino honesto sigue abierto: el candado
      // detiene la cifra cambiada, no la firma que llega tarde.
      await esc.cx.query(
        "UPDATE recibo_caja_rci01 SET importe_total = '5000.00' WHERE documento_id = $1",
        [documentoId],
      );
      await esc.cx.query("UPDATE denominacion_rci01 SET cantidad = 5 WHERE documento_id = $1", [
        documentoId,
      ]);
      await esc.cx.query("SELECT validar_arqueo_rci01($1)", [documentoId]);
      assert.equal(await firmarInterno(esc, documentoId, "RECIBIO_CUSTODIO", "custodio"), "FIRMADO");

      // Las dos firmas acreditan la MISMA huella, que era todo el punto.
      const { rows: huellas } = await esc.cx.query<{ hash_contenido: string }>(
        "SELECT DISTINCT hash_contenido FROM firma_documento_financiero WHERE documento_id = $1",
        [documentoId],
      );
      assert.deepEqual(
        huellas.map((h) => h.hash_contenido),
        [huellaOriginal],
      );

      // Y el folio no aparece en la vista que delata documentos consentidos en
      // dos versiones distintas, que debe estar siempre vacía.
      const { rows: discrepantes } = await esc.cx.query(
        "SELECT documento_id FROM v_firma_discrepante WHERE documento_id = $1",
        [documentoId],
      );
      assert.equal(discrepantes.length, 0);
    });
  },
);

test(
  "firmas: un folio sin contenido capturado no se manda a firma",
  { skip: SIN_BASE },
  async () => {
    await conEscenario(async (esc) => {
      const enBlanco = await emitirFolio(esc, "CACM-RCI-01", "vendedor");

      // Un folio en blanco mandado a firma consume el número y acaba en un
      // documento sellado que no dice nada: ni cliente, ni importe, ni
      // concepto. Todos los campos que el manual marca con (*) ausentes.
      await rechaza(esc, () => mandarAFirma(esc, enBlanco, "vendedor"), {
        codigo: "P0001",
        mensaje: /no tiene contenido capturado/i,
      });
      assert.equal(await estadoDe(esc, enBlanco), "BORRADOR");

      // La salida legítima de un folio que no se va a usar sigue siendo la
      // cancelación con motivo, no el papel en blanco firmado.
      await cambiarEstado(esc, enBlanco, "CANCELADO", "gerente", "Se emitio el folio por error");
      assert.equal(await estadoDe(esc, enBlanco), "CANCELADO");

      // Con su Parte I capturada, el mismo camino se abre sin más.
      const conContenido = await emitirFolio(esc, "CACM-RCI-01", "vendedor");
      await capturarRecibo(esc, conContenido);
      await mandarAFirma(esc, conContenido, "vendedor");
      await firmarRecibo(esc, conContenido);
      assert.equal(await estadoDe(esc, conContenido), "FIRMADO");
    });
  },
);

// =====================================================================
// SELLOS TOKENIZADOS — el cuño que se puede verificar contra la base
// =====================================================================

test(
  "sellos: cada firma estampa su cuño y el cierre agrega DOCUMENTO_FIRMADO",
  { skip: SIN_BASE },
  async () => {
    await conEscenario(async (esc) => {
      const documentoId = await reciboParaFirmar(esc);
      await firmarPresencial(esc, documentoId, "TESTIGO", "Testigo de Mostrador", "gerente");
      await firmarInterno(esc, documentoId, "ENTREGO_VENDEDOR", "vendedor");
      await firmarInterno(esc, documentoId, "RECIBIO_CUSTODIO", "custodio");

      const sellos = await sellosDe(esc, documentoId);
      assert.deepEqual(
        sellos.map((s) => [s.accion_codigo, s.rol_firmante]),
        [
          ["TESTIGO_PRESENCIAL", "TESTIGO"],
          ["ENTREGA_DECLARADA", "ENTREGO_VENDEDOR"],
          ["CUSTODIA_CONFIRMADA", "RECIBIO_CUSTODIO"],
          ["DOCUMENTO_FIRMADO", null],
        ],
      );

      // No puede existir una firma sin su cuño: son tres firmas y tres cuños
      // de rol, más el del conjunto al cerrarse.
      assert.equal(sellos[1].estampado_por, esc.usuarios.vendedor);
      // De una rúbrica presencial responde el usuario interno que la atestiguó.
      assert.equal(sellos[0].estampado_por, esc.usuarios.gerente);
      // Y el cuño de cierre lo pone quien completó la última obligatoria.
      assert.equal(sellos[3].estampado_por, esc.usuarios.custodio);

      // El sello acredita el MISMO contenido que la firma que lo produjo, y
      // ese contenido es el del folio: todas las firmas del documento llevan
      // la misma huella o la 039 rechaza la segunda.
      assert.equal(sellos[2].hash_contenido, hashDe(documentoId));

      // Un documento a medio firmar no lleva el cuño del conjunto.
      const aMedias = await reciboParaFirmar(esc);
      await firmarInterno(esc, aMedias, "ENTREGO_VENDEDOR", "vendedor");
      assert.deepEqual(
        (await sellosDe(esc, aMedias)).map((s) => s.accion_codigo),
        ["ENTREGA_DECLARADA"],
      );
    });
  },
);

test(
  "sellos: los tokens son únicos y cumplen el formato CACM-XXXX-XXXX-XXXX",
  { skip: SIN_BASE },
  async () => {
    await conEscenario(async (esc) => {
      const recibo = await reciboParaFirmar(esc);
      await firmarRecibo(esc, recibo);

      const vale = await valeParaFirmar(esc);
      await firmarInterno(esc, vale, "AUTORIZO_GERENTE", "gerente");
      await firmarInterno(esc, vale, "ENTREGO_CUSTODIO", "custodio");
      await firmarInterno(esc, vale, "RECIBIO_BENEFICIARIO", "vendedor");

      const anulado = await emitirFolio(esc, "CACM-RCI-01", "vendedor");
      await cambiarEstado(esc, anulado, "CANCELADO", "gerente", "Se emitio el folio por equivocacion");

      const tokens = [
        ...(await sellosDe(esc, recibo)),
        ...(await sellosDe(esc, vale)),
        ...(await sellosDe(esc, anulado)),
      ].map((s) => s.token);

      // 3 del recibo + 4 del vale + 1 de la cancelación.
      assert.equal(tokens.length, 8);
      assert.equal(new Set(tokens).size, tokens.length, "los tokens deben ser irrepetibles");

      for (const token of tokens) {
        assert.match(token, FORMATO_TOKEN);
        assert.equal(await bienFormado(esc, token), true, `token mal acuñado: ${token}`);
      }
    });
  },
);

test(
  "sellos: token_sello_bien_formado acepta el token real y rechaza uno con un carácter alterado",
  { skip: SIN_BASE },
  async () => {
    await conEscenario(async (esc) => {
      const documentoId = await reciboParaFirmar(esc);
      await firmarRecibo(esc, documentoId);
      const token = (await sellosDe(esc, documentoId))[0].token;

      assert.equal(await bienFormado(esc, token), true);
      // Quien lo teclea del papel no tiene por qué respetar guiones ni mayúsculas.
      assert.equal(await bienFormado(esc, token.toLowerCase()), true);
      assert.equal(await bienFormado(esc, token.replaceAll("-", "")), true);

      const alterado = alterarUnCaracter(token);
      assert.notEqual(alterado, token);
      // El formato por sí solo no delata el error de captura; el verificador sí.
      assert.match(alterado, FORMATO_TOKEN);
      assert.equal(await bienFormado(esc, alterado), false);

      // Y filtrarlo antes de consultar tiene sentido porque no resuelve a nada.
      const { rows } = await esc.cx.query<{ total: string }>(
        "SELECT count(*)::text AS total FROM v_sello_verificacion WHERE token = $1",
        [alterado],
      );
      assert.equal(rows[0].total, "0");

      // Los caracteres que el alfabeto excluye a propósito tampoco pasan.
      assert.equal(await bienFormado(esc, "CACM-IIII-LLLL-OOOO"), false);
      assert.equal(await bienFormado(esc, "no es un token"), false);
      assert.equal(await bienFormado(esc, null), false);
    });
  },
);

test(
  "sellos: el mismo cuño no se estampa dos veces en el mismo folio",
  { skip: SIN_BASE },
  async () => {
    await conEscenario(async (esc) => {
      const documentoId = await reciboParaFirmar(esc);
      await firmarRecibo(esc, documentoId);

      // Repetir el cuño del cierre duplicaría la evidencia de un mismo hecho.
      await rechaza(
        esc,
        () => estamparSello(esc, documentoId, "DOCUMENTO_FIRMADO", "custodio"),
        { codigo: "P0001", mensaje: /ya fue estampado/i },
      );
      await rechaza(
        esc,
        () => estamparSello(esc, documentoId, "CUSTODIA_CONFIRMADA", "custodio", "RECIBIO_CUSTODIO"),
        { codigo: "P0001", mensaje: /ya fue estampado/i },
      );

      // El candado es por cuño, no por folio: una acción distinta sobre el
      // mismo documento sí acuña su propio token.
      const token = await estamparSello(esc, documentoId, "COMPLEMENTADO", "gerente");
      assert.match(token, FORMATO_TOKEN);
      assert.equal((await sellosDe(esc, documentoId)).length, 4);
    });
  },
);

test(
  "sellos: v_sello_verificacion resuelve un token a su folio, acción y firmante",
  { skip: SIN_BASE },
  async () => {
    await conEscenario(async (esc) => {
      const documentoId = await reciboParaFirmar(esc);
      await firmarPresencial(esc, documentoId, "TESTIGO", "Testigo de Mostrador", "gerente");
      await firmarRecibo(esc, documentoId);

      const sellos = await sellosDe(esc, documentoId);
      const custodia = sellos.filter((s) => s.accion_codigo === "CUSTODIA_CONFIRMADA")[0];

      type FilaVerificacion = {
        folio: string;
        folio_completo: string;
        accion_codigo: string;
        leyenda: string;
        forma: string;
        color: string;
        rol_firmante: string | null;
        rol_etiqueta: string | null;
        estado_documento: string;
        estampado_por_nombre: string;
        hash_contenido: string;
      };
      const verificar = async (token: string) => {
        const { rows } = await esc.cx.query<FilaVerificacion>(
          "SELECT * FROM v_sello_verificacion WHERE token = $1",
          [token],
        );
        assert.equal(rows.length, 1, `el token ${token} debía resolver a un solo sello`);
        return rows[0];
      };

      const fila = await verificar(custodia.token);
      assert.equal(fila.folio, "CACM-RCI-01-0001");
      assert.equal(fila.folio_completo, "CACM-RCI-01-MTY-0001");
      assert.equal(fila.accion_codigo, "CUSTODIA_CONFIRMADA");
      assert.equal(fila.leyenda, "RECIBIDO EN CUSTODIA");
      assert.equal(fila.rol_firmante, "RECIBIO_CUSTODIO");
      assert.match(fila.rol_etiqueta ?? "", /Custodio Financiero/);
      assert.equal(fila.estampado_por_nombre, ACTORES.custodio.nombre);
      assert.equal(fila.estado_documento, "FIRMADO");
      assert.equal(fila.hash_contenido, hashDe(documentoId));

      // De la rúbrica del tercero responde quien la atestiguó, y eso es lo que
      // ve quien teclea ese token.
      const testigo = sellos.filter((s) => s.accion_codigo === "TESTIGO_PRESENCIAL")[0];
      const filaTestigo = await verificar(testigo.token);
      assert.equal(filaTestigo.rol_firmante, "TESTIGO");
      assert.equal(filaTestigo.estampado_por_nombre, ACTORES.gerente.nombre);
      assert.equal(filaTestigo.folio_completo, "CACM-RCI-01-MTY-0001");

      // La verificación es deliberadamente escueta: acredita el hecho sin
      // exponer importes ni datos personales a quien sólo tecleó un token.
      const { fields } = await esc.cx.query("SELECT * FROM v_sello_verificacion WHERE false");
      const columnas = fields.map((f) => f.name);
      assert.ok(!columnas.some((c) => /importe|cliente|firmante_id/.test(c)), columnas.join(", "));
    });
  },
);

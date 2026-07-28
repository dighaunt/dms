/**
 * Pruebas de integración de las reglas 5 y 7 del manual contra Postgres.
 *
 * Las dos reglas son de rendición de cuentas y ninguna vive en TypeScript:
 *
 *  * Regla 5 — el retiro de un socio es ANTICIPO a cuenta de utilidades hasta
 *    que un balance formal las arroje (LGSM art. 19). Eso es una vista
 *    (`v_anticipo_utilidades_socio`), un disparador que avisa
 *    (`avisar_retiro_socio_sin_respaldo`) y dos tablas append-only.
 *  * Regla 7 — el corte JALA los importes de los folios firmados del día y el
 *    único dato que teclea el custodio es el efectivo contado. Eso es
 *    `armar_corte_caja`, `cerrar_corte_caja`, `saldo_inicial_corte` y
 *    `folios_sin_firmar_del_dia`.
 *
 * Probar esto con dobles comprobaría que el doble hace lo que le pedimos, no
 * que la base impida lo que debe impedir; por eso aquí se habla con una base
 * real y se invocan las funciones plpgsql tal como las invoca la capa de
 * servicios.
 *
 * Aislamiento: cada caso abre su propia conexión, siembra DENTRO de una
 * transacción y termina en ROLLBACK. Es lo único que hace repetible una suite
 * que consume folios consecutivos, la UNIQUE de la sucursal y —sobre todo— la
 * UNIQUE (sucursal_id, fecha_corte, turno) del corte de caja. Cuando un mismo
 * caso necesita dos cortes, se separan por fecha o por turno.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import pg from "pg";

import {
  aCentavos,
  arqueoCorte,
  deCentavos,
  explicacionDiferenciaEsSuficiente,
  posicionSocio,
} from "./calculos.ts";
import { centinelaDeBase, SIN_BASE, URL_PRUEBAS } from "./base-pruebas.mts";

// Sin base no hay nada que probar aquí, y callarlo dejaría `npm test` en verde
// con cero cobertura de las reglas 5 y 7. El porqué del mecanismo está en la
// cabecera de `base-pruebas.mts`.
centinelaDeBase("los anticipos de socios y el corte de caja: reglas 5 y 7 del manual");

// ===== Actores =====
// El PIN se fija aquí y no se deriva del id: un id de seis dígitos truncaría
// el lpad de la semilla y la prueba fallaría por una razón que nada tiene que
// ver con lo que dice probar.
const ACTORES = {
  gerente: { email: "gerente@t.mx", pin: "100001" },
  custodio: { email: "custodio@t.mx", pin: "100002" },
  vendedor: { email: "vendedor@t.mx", pin: "100003" },
  socio: { email: "socio@t.mx", pin: "100004" },
  rh: { email: "rh@t.mx", pin: "100005" },
} as const;

type Actor = keyof typeof ACTORES;

/**
 * Semilla mínima: usuarios, una sucursal y dos empleados. Las reglas 5 y 7 no
 * tocan unidades ni expedientes —el RCI-02 y el RCI-03 son terreno de la regla
 * 3—, así que sembrarlos sólo alargaría cada caso. Va en línea y no como
 * archivo suelto para que la suite corra en cualquier clon del repo.
 */
const SEMILLA = `
INSERT INTO usuario (email, nombre, nivel) VALUES
 ('gerente@t.mx','Gerente Prueba','N3'),
 ('custodio@t.mx','Custodio Prueba','N2'),
 ('vendedor@t.mx','Vendedora Prueba','N1'),
 ('socio@t.mx','Socio Prueba','N3'),
 ('rh@t.mx','Recursos Humanos Prueba','N2')
ON CONFLICT (email) DO NOTHING;

INSERT INTO sucursal (clave, nombre, creada_por)
 VALUES ('MTY','Matriz Monterrey',(SELECT id FROM usuario WHERE email='gerente@t.mx'))
ON CONFLICT (clave) DO NOTHING;

INSERT INTO empleado (num_empleado, nombre, puesto, sucursal_id, usuario_id, creado_por) VALUES
 ('E-01','Vendedora Prueba','Vendedor',(SELECT id FROM sucursal WHERE clave='MTY'),
  (SELECT id FROM usuario WHERE email='vendedor@t.mx'),(SELECT id FROM usuario WHERE email='gerente@t.mx')),
 ('E-02','Asesor Servicio','Asesor de servicio',(SELECT id FROM sucursal WHERE clave='MTY'),
  NULL,(SELECT id FROM usuario WHERE email='gerente@t.mx'))
ON CONFLICT (sucursal_id, num_empleado) DO NOTHING;

-- Desde la migración 040 ser socio es una condición que se registra, no algo que
-- se derive de tener cuenta en el DMS: el retiro apunta a una fila de socio y
-- ésta se monta sobre una persona del catálogo. La persona queda enlazada al
-- usuario socio@t.mx porque en esta suite ese actor también firma, pero el
-- enlace es opcional por diseño.
INSERT INTO persona (nombre, id_tipo, id_numero, categoria, usuario_id, creada_por)
SELECT 'Socio Prueba','INE','IDMX-SOCIO-SC1','SOCIO',
       (SELECT id FROM usuario WHERE email='socio@t.mx'),
       (SELECT id FROM usuario WHERE email='gerente@t.mx')
WHERE NOT EXISTS (
  SELECT 1 FROM persona WHERE upper(trim(id_tipo)) = 'INE' AND upper(trim(id_numero)) = 'IDMX-SOCIO-SC1'
);

-- Sin participación declarada a propósito: es opcional en el modelo y así la
-- semilla no consume parte del 100 por ciento que reparten los casos del tope.
INSERT INTO socio (persona_id, acta_referencia, creado_por)
SELECT p.id, 'ACTA-CONSTITUTIVA-2019-01', (SELECT id FROM usuario WHERE email='gerente@t.mx')
  FROM persona p
 WHERE upper(trim(p.id_tipo)) = 'INE' AND upper(trim(p.id_numero)) = 'IDMX-SOCIO-SC1'
   AND NOT EXISTS (SELECT 1 FROM socio s WHERE s.persona_id = p.id);
`;

/** Los identificadores son bigint y el driver los entrega como texto; se dejan así. */
type Escenario = {
  cx: pg.Client;
  usuarios: Record<Actor, string>;
  sucursalId: string;
  empleadoVendedor: string;
  empleadoAsesor: string;
  /** Persona dada de alta como socio vigente: a ella se cargan los retiros. */
  socioPersonaId: string;
  /** Las fechas salen de la base y no de Node: `current_date` y `::date` se
   *  resuelven con la zona horaria de la sesión, y dos relojes distintos
   *  harían fallar el corte de ayer un rato cada noche. */
  hoy: string;
  ayer: string;
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
      await cx.query("SELECT establecer_pin_firma($1, $2)", [rows[0].id, datos.pin]);
    }

    const sucursal = await cx.query<{ id: string }>("SELECT id FROM sucursal WHERE clave = 'MTY'");
    const empleados = await cx.query<{ id: string; num_empleado: string }>(
      "SELECT id, num_empleado FROM empleado ORDER BY num_empleado",
    );
    const fechas = await cx.query<{ hoy: string; ayer: string }>(
      "SELECT current_date::text AS hoy, (current_date - 1)::text AS ayer",
    );
    const socio = await cx.query<{ persona_id: string }>(
      `SELECT s.persona_id FROM socio s
         JOIN persona p ON p.id = s.persona_id
        WHERE upper(trim(p.id_tipo)) = 'INE' AND upper(trim(p.id_numero)) = 'IDMX-SOCIO-SC1'`,
    );

    await cuerpo({
      cx,
      usuarios,
      sucursalId: sucursal.rows[0].id,
      empleadoVendedor: empleados.rows.filter((e) => e.num_empleado === "E-01")[0].id,
      empleadoAsesor: empleados.rows.filter((e) => e.num_empleado === "E-02")[0].id,
      socioPersonaId: socio.rows[0].persona_id,
      hoy: fechas.rows[0].hoy,
      ayer: fechas.rows[0].ayer,
    });
  } finally {
    // ROLLBACK y nunca COMMIT: es lo que devuelve la base al estado en que
    // estaba, incluidos el consecutivo de folios y el corte del día.
    await cx.query("ROLLBACK").catch(() => undefined);
    await cx.end();
  }
}

type ErrorPostgres = Error & { code?: string; constraint?: string };

/**
 * Ejecuta algo que DEBE ser rechazado por la base y devuelve el error para que
 * el caso pueda mirarlo con más detalle.
 *
 * El SAVEPOINT no es adorno: en Postgres cualquier error aborta la transacción
 * completa, y sin él la prueba no podría seguir comprobando nada después del
 * primer rechazo. Además deja intacto lo que se sembró ANTES del intento, que
 * es justo lo que un bloque plpgsql que aborta sí se llevaría por delante.
 */
async function rechaza(
  esc: Escenario,
  accion: () => Promise<unknown>,
  esperado: { codigo?: string; mensaje?: RegExp; restriccion?: RegExp },
): Promise<ErrorPostgres> {
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
  return error;
}

// ===== Dinero =====
// Todo importe viaja como texto y toda cuenta se hace en centavos enteros: un
// double perdería centavos justo en las cifras que el corte declara.

/** numeric llega como texto; normalizarlo evita comparar "0" contra "0.00". */
function importe(valor: string | null | undefined): string {
  const centavos = aCentavos(valor);
  assert.ok(centavos !== null, `se esperaba un importe numérico y llegó ${String(valor)}`);
  return deCentavos(centavos);
}

/** Suma en centavos. El delta puede ser negativo para provocar un faltante. */
function importeMas(base: string, delta: string): string {
  const a = aCentavos(base);
  const b = aCentavos(delta);
  assert.ok(a !== null && b !== null, `importes no sumables: ${base} y ${delta}`);
  return deCentavos(a + b);
}

function importeSuma(valores: string[]): string {
  return valores.reduce((total, valor) => importeMas(total, valor), "0.00");
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

async function emitirFolio(esc: Escenario, tipo: string, usuarioId: string): Promise<string> {
  const { rows } = await esc.cx.query<{ id: string }>(
    "SELECT id FROM emitir_folio_financiero($1, $2, $3)",
    [tipo, esc.sucursalId, usuarioId],
  );
  return rows[0].id;
}

async function mandarAFirma(esc: Escenario, documentoId: string, actor: Actor): Promise<void> {
  await esc.cx.query("SELECT cambiar_estado_documento_fin($1, 'PENDIENTE_DE_FIRMA', $2)", [
    documentoId,
    esc.usuarios[actor],
  ]);
}

async function cancelar(
  esc: Escenario,
  documentoId: string,
  actor: Actor,
  motivo: string,
): Promise<void> {
  await esc.cx.query("SELECT cambiar_estado_documento_fin($1, 'CANCELADO', $2, $3)", [
    documentoId,
    esc.usuarios[actor],
    motivo,
  ]);
}

async function firmarInterno(
  esc: Escenario,
  documentoId: string,
  rol: string,
  actor: Actor,
): Promise<string> {
  const { rows } = await esc.cx.query<{ estado: string }>(
    "SELECT firmar_documento_financiero($1, $2, $3, $4, $5, $6) AS estado",
    [documentoId, rol, esc.usuarios[actor], ACTORES[actor].pin, hashDe(documentoId), "prueba"],
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
      ACTORES[atestigua].pin,
      hashDe(documentoId),
    ],
  );
  return rows[0].estado;
}

async function estadoDe(esc: Escenario, documentoId: string): Promise<string> {
  const { rows } = await esc.cx.query<{ estado: string }>(
    "SELECT estado_documento_fin($1) AS estado",
    [documentoId],
  );
  return rows[0].estado;
}

async function folioDe(esc: Escenario, documentoId: string): Promise<string> {
  const { rows } = await esc.cx.query<{ folio: string }>(
    "SELECT folio FROM v_documento_financiero WHERE id = $1",
    [documentoId],
  );
  return rows[0].folio;
}

// ===== Movimientos del día =====
// Un movimiento declara qué folio se emite y, sobre todo, QUÉ DEBE JALAR el
// corte de él. Esa expectativa la pone el manual (Parte II del RCI-07), no una
// consulta: si aquí se recalculara la agrupación se estaría comprobando que la
// prueba copia bien el SQL, y no que el SQL agrupa como manda el papel.
type TipoMovimiento = "CACM-RCI-01" | "CACM-RCI-04" | "CACM-RCI-05";

type Movimiento = {
  clave: string;
  tipo: TipoMovimiento;
  importe: string;
  /** El RCI-01 es efectivo por definición del formato y no lleva esta columna. */
  formaPago?: string;
  concepto?: string;
  /** Estado en el que queda el folio: el corte sólo jala de los FIRMADOS. */
  destino: "FIRMADO" | "PENDIENTE_DE_FIRMA" | "BORRADOR" | "CANCELADO";
  /** Fecha de la operación; por omisión, hoy. */
  fecha?: string;
  /** Retiro del socio de la semilla; el vale se carga a su fila de `socio`. */
  esDeSocio?: boolean;
  /** Otro socio distinto al de la semilla, cuando el caso lo necesita. */
  socioPersonaId?: string;
  /** Enlace opcional del beneficiario al catálogo, lo que permite sumarle pagos. */
  beneficiarioPersonaId?: string;
  /** Nombre del beneficiario; por omisión se deriva de la clave del movimiento. */
  beneficiario?: string;
  /** Lo que el corte debe registrar de este folio; null si no toca la caja. */
  esperado: { naturaleza: "INGRESO" | "EGRESO"; grupo: string } | null;
};

const MIL_EN_CENTAVOS = 100_000n;

/**
 * Parte II del RCI-01: el desglose de denominaciones tiene que sumar exactamente
 * el importe declarado. Se arma en centavos para que un importe con centavos
 * —que es donde un double se rompe— siga cuadrando.
 */
function desglosarEfectivo(valor: string): { denominacion: string; cantidad: number }[] {
  const centavos = aCentavos(valor);
  assert.ok(centavos !== null && centavos > 0n, `importe inválido para el arqueo: ${valor}`);

  const billetes = centavos / MIL_EN_CENTAVOS;
  const resto = centavos % MIL_EN_CENTAVOS;
  const desglose: { denominacion: string; cantidad: number }[] = [];
  if (billetes > 0n) desglose.push({ denominacion: "1000.00", cantidad: Number(billetes) });
  if (resto > 0n) desglose.push({ denominacion: deCentavos(resto), cantidad: 1 });
  return desglose;
}

/** Momento de la operación: mediodía de la fecha pedida, para que `::date` no baile. */
function momentoDe(esc: Escenario, fecha?: string): string {
  return `${fecha ?? esc.hoy} 12:00`;
}

async function registrarMovimiento(esc: Escenario, mov: Movimiento): Promise<string> {
  const momento = momentoDe(esc, mov.fecha);

  if (mov.tipo === "CACM-RCI-01") {
    const documentoId = await emitirFolio(esc, "CACM-RCI-01", esc.usuarios.vendedor);
    await esc.cx.query(
      `INSERT INTO recibo_caja_rci01
         (documento_id, vendedor_empleado_id, vendedor_id_tipo, vendedor_id_numero,
          cliente_nombre, fecha_hora_cobro, folio_venta_texto, concepto_codigo, importe_total)
       VALUES ($1, $2, 'INE', 'IDMX0011223', $3, $4, $5, 'LIQUIDACION_TOTAL', $6)`,
      [
        documentoId,
        esc.empleadoVendedor,
        `Cliente de ${mov.clave}`,
        momento,
        `C-02-2026-${mov.clave}`,
        mov.importe,
      ],
    );
    for (const linea of desglosarEfectivo(mov.importe)) {
      await esc.cx.query(
        "INSERT INTO denominacion_rci01 (documento_id, denominacion, cantidad) VALUES ($1, $2, $3)",
        [documentoId, linea.denominacion, linea.cantidad],
      );
    }
    // El arqueo del recibo se valida antes de mandarlo a firma, igual que en
    // producción: si el desglose no cuadra, no hay nada que firmar.
    await esc.cx.query("SELECT validar_arqueo_rci01($1)", [documentoId]);

    if (mov.destino === "BORRADOR") return documentoId;
    await mandarAFirma(esc, documentoId, "vendedor");
    if (mov.destino === "PENDIENTE_DE_FIRMA") return documentoId;
    if (mov.destino === "CANCELADO") {
      await cancelar(esc, documentoId, "custodio", `Recibo capturado por error: ${mov.clave}`);
      return documentoId;
    }
    await firmarInterno(esc, documentoId, "ENTREGO_VENDEDOR", "vendedor");
    await firmarInterno(esc, documentoId, "RECIBIO_CUSTODIO", "custodio");
    return documentoId;
  }

  if (mov.tipo === "CACM-RCI-04") {
    const documentoId = await emitirFolio(esc, "CACM-RCI-04", esc.usuarios.rh);
    await esc.cx.query(
      `INSERT INTO ingreso_servicio_rci04
         (documento_id, cliente_nombre, orden_servicio, fecha_hora_cobro, descripcion_servicio,
          cobrador_empleado_id, forma_pago, importe_total)
       VALUES ($1, $2, $3, $4, 'Servicio de taller documentado en la orden', $5, $6, $7)`,
      [
        documentoId,
        `Cliente de ${mov.clave}`,
        `OS-${mov.clave}`,
        momento,
        esc.empleadoAsesor,
        mov.formaPago ?? "EFECTIVO",
        mov.importe,
      ],
    );

    if (mov.destino === "BORRADOR") return documentoId;
    await mandarAFirma(esc, documentoId, "rh");
    if (mov.destino === "PENDIENTE_DE_FIRMA") return documentoId;
    if (mov.destino === "CANCELADO") {
      await cancelar(esc, documentoId, "custodio", `Ingreso capturado por error: ${mov.clave}`);
      return documentoId;
    }
    await firmarInterno(esc, documentoId, "ENTREGO_ASESOR", "rh");
    await firmarInterno(esc, documentoId, "RECIBIO_CUSTODIO", "custodio");
    return documentoId;
  }

  const documentoId = await emitirFolio(esc, "CACM-RCI-05", esc.usuarios.gerente);
  const beneficiario = nombreBeneficiario(mov);
  await esc.cx.query(
    `INSERT INTO vale_egreso_rci05
       (documento_id, fecha_hora, concepto_codigo, beneficiario_nombre, beneficiario_id_tipo,
        beneficiario_id_numero, socio_persona_id, beneficiario_persona_id, forma_pago, importe)
     VALUES ($1, $2, $3, $4, 'INE', 'IDMX7654321', $5, $6, $7, $8)`,
    [
      documentoId,
      momento,
      mov.concepto ?? "GASTO_OPERATIVO",
      beneficiario,
      // El vale ya no apunta a un usuario: la condición de socio vive en la
      // tabla `socio`, montada sobre la persona del catálogo.
      mov.socioPersonaId ?? (mov.esDeSocio ? esc.socioPersonaId : null),
      mov.beneficiarioPersonaId ?? null,
      mov.formaPago ?? "EFECTIVO",
      mov.importe,
    ],
  );

  if (mov.destino === "BORRADOR") return documentoId;
  await mandarAFirma(esc, documentoId, "gerente");
  if (mov.destino === "PENDIENTE_DE_FIRMA") return documentoId;
  if (mov.destino === "CANCELADO") {
    await cancelar(esc, documentoId, "custodio", `Vale capturado por error: ${mov.clave}`);
    return documentoId;
  }
  await firmarInterno(esc, documentoId, "AUTORIZO_GERENTE", "gerente");
  await firmarInterno(esc, documentoId, "ENTREGO_CUSTODIO", "custodio");
  await firmarPresencial(esc, documentoId, "RECIBIO_BENEFICIARIO", beneficiario, "custodio");
  return documentoId;
}

/** Quién cobra el vale, tal como se teclea en el papel. */
function nombreBeneficiario(mov: Movimiento): string {
  if (mov.beneficiario) return mov.beneficiario;
  return mov.esDeSocio ? "Socio Prueba" : `Beneficiario de ${mov.clave}`;
}

async function sembrarDia(
  esc: Escenario,
  movimientos: Movimiento[],
): Promise<Map<string, string>> {
  const porClave = new Map<string, string>();
  for (const mov of movimientos) {
    porClave.set(mov.clave, await registrarMovimiento(esc, mov));
  }
  return porClave;
}

/**
 * Totales que el corte DEBERÍA producir, derivados de los propios movimientos
 * sembrados. La prueba no teclea ningún total: si `armar_corte_caja` sumara de
 * más o de menos, esta cuenta y la de la base dejarían de coincidir.
 */
function totalesEsperados(
  movimientos: Movimiento[],
  extras: { saldoInicial?: string; egresosDeclarados?: string[] } = {},
): { ingresos: string; egresos: string; saldoCalculado: string } {
  const ingresos = importeSuma(
    movimientos.filter((m) => m.esperado?.naturaleza === "INGRESO").map((m) => m.importe),
  );
  const egresos = importeSuma([
    ...movimientos.filter((m) => m.esperado?.naturaleza === "EGRESO").map((m) => m.importe),
    ...(extras.egresosDeclarados ?? []),
  ]);
  const saldoInicial = extras.saldoInicial ?? "0.00";

  return {
    ingresos,
    egresos,
    saldoCalculado: importeMas(importeMas(saldoInicial, ingresos), `-${egresos}`),
  };
}

// ===== Corte de caja =====

type FilaCorte = {
  saldo_inicial: string;
  total_ingresos: string;
  total_egresos: string;
  saldo_calculado: string;
  efectivo_contado: string | null;
  diferencia: string | null;
  explicacion_diferencia: string | null;
};

async function abrirCorte(
  esc: Escenario,
  opciones: { fecha?: string; turno?: string } = {},
): Promise<string> {
  const documentoId = await emitirFolio(esc, "CACM-RCI-07", esc.usuarios.custodio);
  await esc.cx.query(
    `INSERT INTO corte_caja_rci07 (documento_id, sucursal_id, fecha_corte, turno, custodio_usuario_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      documentoId,
      esc.sucursalId,
      opciones.fecha ?? esc.hoy,
      opciones.turno ?? "UNICO",
      esc.usuarios.custodio,
    ],
  );
  return documentoId;
}

async function armarCorte(esc: Escenario, corteId: string): Promise<FilaCorte> {
  await esc.cx.query("SELECT armar_corte_caja($1, $2)", [corteId, esc.usuarios.custodio]);
  return leerCorte(esc, corteId);
}

async function cerrarCorte(
  esc: Escenario,
  corteId: string,
  efectivoContado: string,
  explicacion: string | null,
): Promise<void> {
  await esc.cx.query("SELECT cerrar_corte_caja($1, $2, $3, $4)", [
    corteId,
    efectivoContado,
    esc.usuarios.custodio,
    explicacion,
  ]);
}

async function leerCorte(esc: Escenario, corteId: string): Promise<FilaCorte> {
  const { rows } = await esc.cx.query<FilaCorte>(
    `SELECT saldo_inicial, total_ingresos, total_egresos, saldo_calculado,
            efectivo_contado, diferencia, explicacion_diferencia
       FROM corte_caja_rci07 WHERE documento_id = $1`,
    [corteId],
  );
  return rows[0];
}

async function detalleCorte(
  esc: Escenario,
  corteId: string,
): Promise<{ origen_documento_id: string; naturaleza: string; concepto_grupo: string; importe: string }[]> {
  const { rows } = await esc.cx.query<{
    origen_documento_id: string;
    naturaleza: string;
    concepto_grupo: string;
    importe: string;
  }>(
    `SELECT origen_documento_id, naturaleza, concepto_grupo, importe
       FROM corte_caja_detalle WHERE corte_documento_id = $1 ORDER BY origen_documento_id`,
    [corteId],
  );
  return rows;
}

/** Firma el corte con sus dos rúbricas obligatorias: el custodio y el gerente. */
async function firmarCorte(esc: Escenario, corteId: string): Promise<string> {
  await firmarInterno(esc, corteId, "ELABORO_CUSTODIO", "custodio");
  return firmarInterno(esc, corteId, "REVISO_GERENTE", "gerente");
}

async function alertasDe(
  esc: Escenario,
  documentoId: string,
): Promise<{ tipo: string; severidad: string; mensaje: string; sucursal_id: string | null }[]> {
  const { rows } = await esc.cx.query<{
    tipo: string;
    severidad: string;
    mensaje: string;
    sucursal_id: string | null;
  }>(
    "SELECT tipo, severidad, mensaje, sucursal_id FROM alerta_finanzas WHERE documento_id = $1 ORDER BY id",
    [documentoId],
  );
  return rows;
}

async function saldoInicialDe(esc: Escenario, fecha: string): Promise<string> {
  const { rows } = await esc.cx.query<{ saldo: string }>(
    "SELECT saldo_inicial_corte($1, $2) AS saldo",
    [esc.sucursalId, fecha],
  );
  return importe(rows[0].saldo);
}

// ===== Anticipos de socio =====

type PosicionEnBase = {
  socio_nombre: string;
  socio_usuario_id: string | null;
  participacion_pct: string | null;
  activo: boolean;
  total_anticipos: string;
  total_repartido: string;
  saldo_por_comprobar: string;
};

/**
 * La vista se consulta por la PERSONA del socio, no por su usuario: desde la
 * 040 un socio puede no tener cuenta en el DMS y aun así tener que aparecer.
 */
async function posicionEnBase(esc: Escenario, personaId: string): Promise<PosicionEnBase | null> {
  const { rows } = await esc.cx.query<PosicionEnBase>(
    `SELECT socio_nombre, socio_usuario_id, participacion_pct, activo,
            total_anticipos, total_repartido, saldo_por_comprobar
       FROM v_anticipo_utilidades_socio WHERE socio_persona_id = $1`,
    [personaId],
  );
  return rows[0] ?? null;
}

/** Vale de retiro de socio, firmado por sus tres firmantes. */
async function retiroDeSocio(esc: Escenario, clave: string, monto: string): Promise<string> {
  return registrarMovimiento(esc, {
    clave,
    tipo: "CACM-RCI-05",
    concepto: "RETIRO_UTILIDADES_SOCIO",
    importe: monto,
    esDeSocio: true,
    destino: "FIRMADO",
    esperado: { naturaleza: "EGRESO", grupo: "RETIRO_SOCIOS" },
  });
}

async function registrarReparto(
  esc: Escenario,
  datos: { ejercicio: string; utilidadRepartible: string; acta: string; asignadoAlSocio: string },
): Promise<string> {
  const { rows } = await esc.cx.query<{ id: string }>(
    `INSERT INTO reparto_utilidades
       (ejercicio, fecha_balance, utilidad_repartible, acta_referencia, autorizado_por)
     VALUES ($1, current_date, $2, $3, $4) RETURNING id`,
    [datos.ejercicio, datos.utilidadRepartible, datos.acta, esc.usuarios.gerente],
  );
  await esc.cx.query(
    `INSERT INTO reparto_utilidades_socio (reparto_id, socio_persona_id, monto_asignado)
     VALUES ($1, $2, $3)`,
    [rows[0].id, esc.socioPersonaId, datos.asignadoAlSocio],
  );
  return rows[0].id;
}

// =====================================================================
// REGLA 5 — el retiro de un socio es anticipo, no reparto definitivo
// =====================================================================

test(
  "regla 5: el retiro firmado de un socio se presenta como saldo por comprobar, no como gasto cerrado",
  { skip: SIN_BASE },
  async () => {
    await conEscenario(async (esc) => {
      // Un vale sin firmar todavía no es dinero entregado: la vista sólo suma lo
      // FIRMADO. El socio SÍ aparece —desde la 040 la vista parte del registro
      // de socios y los enumera a todos—, pero con la posición en ceros: lo que
      // no está firmado no le carga nada.
      await registrarMovimiento(esc, {
        clave: "borrador-socio",
        tipo: "CACM-RCI-05",
        concepto: "RETIRO_UTILIDADES_SOCIO",
        importe: "12000.00",
        esDeSocio: true,
        destino: "PENDIENTE_DE_FIRMA",
        esperado: null,
      });
      const sinFirmar = await posicionEnBase(esc, esc.socioPersonaId);
      assert.ok(sinFirmar, "el socio registrado debe aparecer aunque no tenga movimiento firmado");
      assert.equal(importe(sinFirmar.total_anticipos), "0.00");
      assert.equal(importe(sinFirmar.saldo_por_comprobar), "0.00");

      const valeId = await retiroDeSocio(esc, "retiro-1", "30000.00");
      assert.equal(await estadoDe(esc, valeId), "FIRMADO");

      const fila = await posicionEnBase(esc, esc.socioPersonaId);
      assert.ok(fila, "el socio con retiro firmado debe aparecer en la vista de anticipos");
      assert.equal(importe(fila.total_anticipos), "30000.00");
      assert.equal(importe(fila.total_repartido), "0.00");
      assert.equal(importe(fila.saldo_por_comprobar), "30000.00");

      // El espejo de pantalla tiene que decir lo mismo que la base: si divergen,
      // el gerente vería como gasto cerrado lo que la base guarda como anticipo.
      const espejo = posicionSocio({
        totalAnticipos: fila.total_anticipos,
        totalRepartido: fila.total_repartido,
      });
      assert.equal(espejo?.tieneSaldoPorComprobar, true);
      assert.equal(espejo?.saldoPorComprobar, "30000.00");
      assert.match(espejo?.etiqueta ?? "", /anticipo a cuenta de utilidades/i);
    });
  },
);

test(
  "regla 5: el retiro sin reparto que lo respalde levanta la alerta RETIRO_SOCIO_SIN_RESPALDO",
  { skip: SIN_BASE },
  async () => {
    await conEscenario(async (esc) => {
      const valeId = await retiroDeSocio(esc, "retiro-1", "30000.00");

      const alertas = await alertasDe(esc, valeId);
      assert.equal(alertas.length, 1, "el retiro sin respaldo deja exactamente un aviso");
      assert.equal(alertas[0].tipo, "RETIRO_SOCIO_SIN_RESPALDO");
      // AVISO y no GRAVE: el retiro no se bloquea —la empresa puede necesitar
      // entregarlo— pero queda señalado hasta que un balance lo respalde.
      assert.equal(alertas[0].severidad, "AVISO");
      assert.equal(alertas[0].sucursal_id, esc.sucursalId);
      assert.match(alertas[0].mensaje, /anticipo a cuenta de utilidades/i);
      assert.match(alertas[0].mensaje, /30,000\.00/);

      // Un egreso ordinario del mismo importe no levanta nada: lo que dispara
      // el aviso es el concepto, no la cifra.
      const gastoId = await registrarMovimiento(esc, {
        clave: "gasto-igual",
        tipo: "CACM-RCI-05",
        concepto: "GASTO_OPERATIVO",
        importe: "30000.00",
        destino: "FIRMADO",
        esperado: { naturaleza: "EGRESO", grupo: "PROVEEDORES_Y_GASTOS" },
      });
      assert.deepEqual(await alertasDe(esc, gastoId), []);
    });
  },
);

test(
  "regla 5: un reparto formal con su asignación al socio baja el saldo por comprobar",
  { skip: SIN_BASE },
  async () => {
    await conEscenario(async (esc) => {
      await retiroDeSocio(esc, "retiro-1", "30000.00");
      assert.equal(
        importe((await posicionEnBase(esc, esc.socioPersonaId))?.saldo_por_comprobar),
        "30000.00",
      );

      // Primer balance: respalda sólo una parte. El anticipo baja pero no
      // desaparece, que es exactamente lo que el socio debe seguir viendo.
      await registrarReparto(esc, {
        ejercicio: "2026",
        utilidadRepartible: "180000.00",
        acta: "ACTA-ASAMBLEA-2026-01",
        asignadoAlSocio: "20000.00",
      });
      const parcial = await posicionEnBase(esc, esc.socioPersonaId);
      assert.equal(importe(parcial?.total_repartido), "20000.00");
      assert.equal(importe(parcial?.saldo_por_comprobar), "10000.00");
      assert.equal(
        posicionSocio({
          totalAnticipos: parcial?.total_anticipos ?? "0",
          totalRepartido: parcial?.total_repartido ?? "0",
        })?.tieneSaldoPorComprobar,
        true,
      );

      // Segundo balance: los repartos se acumulan y el anticipo queda cubierto.
      await registrarReparto(esc, {
        ejercicio: "2026-S2",
        utilidadRepartible: "90000.00",
        acta: "ACTA-ASAMBLEA-2026-02",
        asignadoAlSocio: "10000.00",
      });
      const cubierto = await posicionEnBase(esc, esc.socioPersonaId);
      assert.equal(importe(cubierto?.total_anticipos), "30000.00");
      assert.equal(importe(cubierto?.total_repartido), "30000.00");
      assert.equal(importe(cubierto?.saldo_por_comprobar), "0.00");

      const espejo = posicionSocio({
        totalAnticipos: cubierto?.total_anticipos ?? "0",
        totalRepartido: cubierto?.total_repartido ?? "0",
      });
      assert.equal(espejo?.tieneSaldoPorComprobar, false);
      assert.match(espejo?.etiqueta ?? "", /respaldado por reparto formal/i);
    });
  },
);

test(
  "regla 5: con reparto previo el retiro no alerta, y vuelve a alertar cuando lo excede",
  { skip: SIN_BASE },
  async () => {
    await conEscenario(async (esc) => {
      // El balance existe ANTES del retiro: hay utilidad repartible que respalda
      // lo que el socio se lleva, así que no hay nada que señalar.
      await registrarReparto(esc, {
        ejercicio: "2026",
        utilidadRepartible: "400000.00",
        acta: "ACTA-ASAMBLEA-2026-01",
        asignadoAlSocio: "40000.00",
      });

      const respaldadoId = await retiroDeSocio(esc, "retiro-1", "30000.00");
      assert.deepEqual(
        await alertasDe(esc, respaldadoId),
        [],
        "un retiro cubierto por el reparto no debe levantar aviso",
      );

      // Segundo retiro: con 40,000 repartidos y 30,000 ya retirados, sólo quedan
      // 10,000 respaldados. Pedir 20,000 vuelve a convertirlo en anticipo.
      const excedidoId = await retiroDeSocio(esc, "retiro-2", "20000.00");
      const alertas = await alertasDe(esc, excedidoId);
      assert.equal(alertas.length, 1);
      assert.equal(alertas[0].tipo, "RETIRO_SOCIO_SIN_RESPALDO");

      const posicion = await posicionEnBase(esc, esc.socioPersonaId);
      assert.equal(importe(posicion?.total_anticipos), "50000.00");
      assert.equal(importe(posicion?.total_repartido), "40000.00");
      assert.equal(importe(posicion?.saldo_por_comprobar), "10000.00");
    });
  },
);

test(
  "regla 5: un reparto ya registrado no se puede reescribir ni borrar",
  { skip: SIN_BASE },
  async () => {
    await conEscenario(async (esc) => {
      await retiroDeSocio(esc, "retiro-1", "30000.00");
      const repartoId = await registrarReparto(esc, {
        ejercicio: "2026",
        utilidadRepartible: "180000.00",
        acta: "ACTA-ASAMBLEA-2026-01",
        asignadoAlSocio: "20000.00",
      });

      // Un balance aprobado por la asamblea es un hecho: corregirlo en silencio
      // dejaría un anticipo "respaldado" por una utilidad que nadie aprobó.
      await rechaza(
        esc,
        () =>
          esc.cx.query("UPDATE reparto_utilidades SET utilidad_repartible = $1 WHERE id = $2", [
            "999999.00",
            repartoId,
          ]),
        { codigo: "P0001", mensaje: /append-only/i },
      );
      await rechaza(esc, () => esc.cx.query("DELETE FROM reparto_utilidades WHERE id = $1", [repartoId]), {
        codigo: "P0001",
        mensaje: /append-only/i,
      });
      await rechaza(
        esc,
        () =>
          esc.cx.query("UPDATE reparto_utilidades_socio SET monto_asignado = $1 WHERE reparto_id = $2", [
            "999999.00",
            repartoId,
          ]),
        { codigo: "P0001", mensaje: /append-only/i },
      );
      await rechaza(
        esc,
        () => esc.cx.query("DELETE FROM reparto_utilidades_socio WHERE reparto_id = $1", [repartoId]),
        { codigo: "P0001", mensaje: /append-only/i },
      );

      // Tampoco por la puerta de atrás: el ejercicio es único, así que no se
      // puede "volver a repartir" el mismo periodo con otras cifras.
      await rechaza(
        esc,
        () =>
          registrarReparto(esc, {
            ejercicio: "2026",
            utilidadRepartible: "999999.00",
            acta: "ACTA-ASAMBLEA-2026-BIS",
            asignadoAlSocio: "999999.00",
          }),
        { codigo: "23505", restriccion: /ejercicio/ },
      );

      // Nada se movió: el saldo por comprobar sigue contando lo mismo.
      const posicion = await posicionEnBase(esc, esc.socioPersonaId);
      assert.equal(importe(posicion?.total_repartido), "20000.00");
      assert.equal(importe(posicion?.saldo_por_comprobar), "10000.00");
    });
  },
);

// =====================================================================
// EL REGISTRO DE SOCIOS Y EL CATÁLOGO DE PERSONAS (migración 040)
// =====================================================================
//
// Hasta la 040 «ser socio» se leía de la tabla de usuarios: el selector del
// retiro se llenaba con TODOS los que tenían cuenta en el DMS. Eso permitía
// entregarle un retiro de utilidades a quien no tiene parte del capital, y el
// sistema lo asentaba sin objetar. Lo que se prueba aquí son los candados que
// cierran ese hueco, y ninguno vive en TypeScript: son un disparador de
// aritmética elemental, otro de vigencia, un CHECK y un índice único parcial
// que normaliza mayúsculas y espacios.

/** Alta en el catálogo. La identificación es opcional aquí y obligatoria en el vale. */
async function altaDePersona(
  esc: Escenario,
  datos: {
    nombre: string;
    idTipo?: string;
    idNumero?: string;
    categoria?: string;
    usuarioId?: string;
  },
): Promise<string> {
  const { rows } = await esc.cx.query<{ id: string }>(
    `INSERT INTO persona (nombre, id_tipo, id_numero, categoria, usuario_id, creada_por)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [
      datos.nombre,
      datos.idTipo ?? null,
      datos.idNumero ?? null,
      datos.categoria ?? "OTRO",
      datos.usuarioId ?? null,
      esc.usuarios.gerente,
    ],
  );
  return rows[0].id;
}

/**
 * Alta de un socio con su persona. Devuelve el `persona_id`, que es la llave con
 * la que lo nombran el vale, el reparto y la vista.
 *
 * El acta es obligatoria por diseño: un socio que nadie puede acreditar con un
 * documento no debería poder retirar utilidades a cuenta de nada.
 */
async function altaDeSocio(
  esc: Escenario,
  datos: { nombre: string; participacion?: string; acta?: string; usuarioId?: string },
): Promise<string> {
  const personaId = await altaDePersona(esc, {
    nombre: datos.nombre,
    categoria: "SOCIO",
    usuarioId: datos.usuarioId,
  });
  await esc.cx.query(
    `INSERT INTO socio (persona_id, participacion_pct, acta_referencia, creado_por)
     VALUES ($1, $2, $3, $4)`,
    [
      personaId,
      datos.participacion ?? null,
      datos.acta ?? "ACTA-ASAMBLEA-ALTA-DE-SOCIO",
      esc.usuarios.gerente,
    ],
  );
  return personaId;
}

async function darDeBaja(esc: Escenario, personaId: string, fecha?: string): Promise<void> {
  await esc.cx.query("UPDATE socio SET fecha_baja = $2 WHERE persona_id = $1", [
    personaId,
    fecha ?? esc.hoy,
  ]);
}

test(
  "registro de socios: las participaciones de los vigentes suman 100 como máximo",
  { skip: SIN_BASE },
  async () => {
    await conEscenario(async (esc) => {
      // Exactamente 100 es el reparto completo del capital y tiene que caber: el
      // tope es «no más de una vez», no «menos de una vez».
      await altaDeSocio(esc, { nombre: "Socia Mayoritaria", participacion: "60.00" });
      const minoritario = await altaDeSocio(esc, {
        nombre: "Socio Minoritario",
        participacion: "40.00",
      });

      const { rows } = await esc.cx.query<{ total: string }>(
        "SELECT COALESCE(sum(participacion_pct), 0)::text AS total FROM socio WHERE fecha_baja IS NULL",
      );
      assert.equal(rows[0].total, "100.00");

      // Un centésimo de más ya reparte dinero que no existe. El mensaje dice
      // cuánto sumaría, que es lo que permite corregir sin adivinar.
      const error = await rechaza(
        esc,
        () => altaDeSocio(esc, { nombre: "Socio Sobrante", participacion: "0.01" }),
        { codigo: "P0001", mensaje: /capital social no puede repartirse mas de una vez/i },
      );
      assert.match(error.message, /100\.01/);

      // Tampoco por la puerta de atrás: subirle el porcentaje a un socio ya
      // registrado pasa por el mismo disparador.
      await rechaza(
        esc,
        () =>
          esc.cx.query("UPDATE socio SET participacion_pct = $2 WHERE persona_id = $1", [
            minoritario,
            "40.01",
          ]),
        { codigo: "P0001", mensaje: /capital social/i },
      );

      // Y bajarlo sí se puede: lo que el candado impide es pasarse, no moverse.
      await esc.cx.query("UPDATE socio SET participacion_pct = $2 WHERE persona_id = $1", [
        minoritario,
        "30.00",
      ]);
      const { rows: tras } = await esc.cx.query<{ total: string }>(
        "SELECT COALESCE(sum(participacion_pct), 0)::text AS total FROM socio WHERE fecha_baja IS NULL",
      );
      assert.equal(tras[0].total, "90.00");
    });
  },
);

test(
  "registro de socios: un socio dado de baja deja de contar para el tope de participación",
  { skip: SIN_BASE },
  async () => {
    await conEscenario(async (esc) => {
      await altaDeSocio(esc, { nombre: "Socia Fundadora", participacion: "60.00" });
      const saliente = await altaDeSocio(esc, { nombre: "Socio Saliente", participacion: "40.00" });

      // Con los dos vigentes no cabe nadie más: 60 + 40 + 40 serían 140.
      await rechaza(
        esc,
        () => altaDeSocio(esc, { nombre: "Socio Entrante", participacion: "40.00" }),
        { codigo: "P0001", mensaje: /140\.00/ },
      );

      // Quien vendió su parte deja de contar en la suma —su participación ya no
      // es de nadie— y el hueco que dejó puede volver a ocuparse.
      await darDeBaja(esc, saliente);
      const entrante = await altaDeSocio(esc, {
        nombre: "Socio Entrante",
        participacion: "40.00",
      });

      const { rows } = await esc.cx.query<{ total: string }>(
        "SELECT COALESCE(sum(participacion_pct), 0)::text AS total FROM socio WHERE fecha_baja IS NULL",
      );
      assert.equal(rows[0].total, "100.00");

      // La baja no borra al socio: sigue en el registro y en la vista, marcado
      // como no vigente. Un socio que desaparece se lleva su historial consigo.
      const posicionSaliente = await posicionEnBase(esc, saliente);
      assert.ok(posicionSaliente, "el socio dado de baja debe seguir apareciendo en la vista");
      assert.equal(posicionSaliente.activo, false);
      assert.equal((await posicionEnBase(esc, entrante))?.activo, true);
    });
  },
);

test(
  "registro de socios: un socio dado de baja no puede recibir un retiro de utilidades",
  { skip: SIN_BASE },
  async () => {
    await conEscenario(async (esc) => {
      const saliente = await altaDeSocio(esc, {
        nombre: "Socio Saliente",
        participacion: "25.00",
      });

      // Mientras es socio vigente el retiro entra sin problema: así queda claro
      // que lo que rechaza el intento de después es la baja y no otra cosa.
      const vigente = await registrarMovimiento(esc, {
        clave: "retiro-vigente",
        tipo: "CACM-RCI-05",
        concepto: "RETIRO_UTILIDADES_SOCIO",
        importe: "5000.00",
        socioPersonaId: saliente,
        beneficiario: "Socio Saliente",
        destino: "FIRMADO",
        esperado: { naturaleza: "EGRESO", grupo: "RETIRO_SOCIOS" },
      });
      assert.equal(await estadoDe(esc, vigente), "FIRMADO");

      await darDeBaja(esc, saliente);

      // Ya no hay utilidad a la que tenga derecho: el retiro no se sostiene en
      // nada y el disparador lo dice con su nombre, no con un código.
      const error = await rechaza(
        esc,
        () =>
          registrarMovimiento(esc, {
            clave: "retiro-tras-la-baja",
            tipo: "CACM-RCI-05",
            concepto: "RETIRO_UTILIDADES_SOCIO",
            importe: "5000.00",
            socioPersonaId: saliente,
            beneficiario: "Socio Saliente",
            destino: "BORRADOR",
            esperado: null,
          }),
        { codigo: "P0001", mensaje: /ya no figura como socio vigente/i },
      );
      assert.match(error.message, /Socio Saliente/);

      // Lo que ya se firmó no se toca: la baja mira hacia adelante y el retiro
      // que el socio recibió cuando lo era sigue contando en su posición.
      const posicion = await posicionEnBase(esc, saliente);
      assert.equal(importe(posicion?.total_anticipos), "5000.00");
      assert.equal(importe(posicion?.saldo_por_comprobar), "5000.00");
    });
  },
);

test(
  "regla 5: la vista de anticipos lista al socio recién dado de alta con la posición en cero",
  { skip: SIN_BASE },
  async () => {
    await conEscenario(async (esc) => {
      // Éste es el cambio de conducta de la 040. Antes la vista partía de los
      // movimientos y un socio sin retiros no existía para el sistema: el
      // tablero sólo enumeraba a los que debían, así que no había forma de ver
      // que a alguien no se le había entregado nada.
      const recien = await altaDeSocio(esc, {
        nombre: "Socia Sin Movimiento",
        participacion: "25.00",
        acta: "ACTA-ASAMBLEA-2026-07",
      });

      const fila = await posicionEnBase(esc, recien);
      assert.ok(fila, "un socio sin movimiento tiene que aparecer en la vista");
      assert.equal(fila.socio_nombre, "Socia Sin Movimiento");
      assert.equal(fila.participacion_pct, "25.00");
      assert.equal(fila.activo, true);
      assert.equal(importe(fila.total_anticipos), "0.00");
      assert.equal(importe(fila.total_repartido), "0.00");
      assert.equal(importe(fila.saldo_por_comprobar), "0.00");

      // Y sin cuenta en el DMS: un accionista rara vez opera el sistema, y el
      // registro tiene que poder verlo igual.
      assert.equal(fila.socio_usuario_id, null);

      // El espejo de pantalla no lo confunde con alguien que deba dinero.
      const espejo = posicionSocio({
        totalAnticipos: fila.total_anticipos,
        totalRepartido: fila.total_repartido,
      });
      assert.equal(espejo?.tieneSaldoPorComprobar, false);

      // El socio de la semilla, con cuenta de usuario, sigue enlazado: el
      // enlace es opcional, no inexistente.
      assert.equal(
        (await posicionEnBase(esc, esc.socioPersonaId))?.socio_usuario_id,
        esc.usuarios.socio,
      );
    });
  },
);

test(
  "catálogo de personas: dos personas no pueden compartir la misma identificación oficial",
  { skip: SIN_BASE },
  async () => {
    await conEscenario(async (esc) => {
      await altaDePersona(esc, {
        nombre: "Refaccionaria del Norte",
        idTipo: "INE",
        idNumero: "IDMX-A1",
        categoria: "PROVEEDOR",
      });

      // El duplicado que se cuela en la práctica no es una copia exacta: es el
      // mismo documento tecleado en minúsculas y con un espacio de más, con el
      // nombre escrito de otra manera. El índice normaliza con upper(trim(...))
      // justo para eso; sin ello el catálogo deja de servir para lo que se creó,
      // que es saber cuánto se le ha pagado a alguien.
      await rechaza(
        esc,
        () =>
          altaDePersona(esc, {
            nombre: "Refaccionaria del Nte.",
            idTipo: "ine",
            idNumero: " idmx-a1 ",
            categoria: "PROVEEDOR",
          }),
        { codigo: "23505", restriccion: /persona_identificacion_unica/ },
      );

      // Otra identificación del mismo tipo sí entra: lo que designa a una sola
      // persona es el documento completo, no el tipo.
      await altaDePersona(esc, {
        nombre: "Refaccionaria del Sur",
        idTipo: "INE",
        idNumero: "IDMX-A2",
        categoria: "PROVEEDOR",
      });

      // Y el índice es parcial: a quien se le paga una sola vez en la vida se le
      // puede dar de alta sin identificación, cuantas veces haga falta.
      await altaDePersona(esc, { nombre: "Servicio Ocasional Uno" });
      await altaDePersona(esc, { nombre: "Servicio Ocasional Dos" });
    });
  },
);

test(
  "catálogo de personas: v_pagos_por_persona suma sólo los vales firmados",
  { skip: SIN_BASE },
  async () => {
    await conEscenario(async (esc) => {
      const proveedor = await altaDePersona(esc, {
        nombre: "Refaccionaria del Norte",
        idTipo: "INE",
        idNumero: "IDMX-PROV-01",
        categoria: "PROVEEDOR",
      });
      const sinPagos = await altaDePersona(esc, {
        nombre: "Proveedor Recien Dado de Alta",
        categoria: "PROVEEDOR",
      });

      const pagoDe = async (
        clave: string,
        importePagado: string,
        destino: Movimiento["destino"],
      ) =>
        registrarMovimiento(esc, {
          clave,
          tipo: "CACM-RCI-05",
          concepto: "PAGO_PROVEEDOR",
          importe: importePagado,
          formaPago: "EFECTIVO",
          beneficiario: "Refaccionaria del Norte",
          beneficiarioPersonaId: proveedor,
          destino,
          esperado: null,
        });

      await pagoDe("pago-firmado-1", "5000.00", "FIRMADO");
      await pagoDe("pago-firmado-2", "7000.00", "FIRMADO");
      // Un borrador es una intención y un cancelado es un error corregido:
      // ninguno de los dos movió dinero, y sumarlos inflaría lo que se cree
      // haberle pagado al proveedor.
      await pagoDe("pago-borrador", "9999.00", "BORRADOR");
      await pagoDe("pago-cancelado", "8888.00", "CANCELADO");

      const { rows } = await esc.cx.query<{
        vales: string;
        total_pagado: string;
        ultimo_pago: Date | null;
      }>(
        "SELECT vales::text AS vales, total_pagado, ultimo_pago FROM v_pagos_por_persona WHERE persona_id = $1",
        [proveedor],
      );
      assert.equal(rows[0].vales, "2", "sólo los dos vales firmados cuentan como pago");
      assert.equal(importe(rows[0].total_pagado), "12000.00");
      assert.ok(rows[0].ultimo_pago, "el último pago debe salir del vale firmado más reciente");

      // Quien todavía no ha cobrado nada aparece en ceros y no desaparece del
      // catálogo: es la misma razón por la que la vista de socios lista a los de
      // saldo cero.
      const { rows: nuevo } = await esc.cx.query<{ vales: string; total_pagado: string }>(
        "SELECT vales::text AS vales, total_pagado FROM v_pagos_por_persona WHERE persona_id = $1",
        [sinPagos],
      );
      assert.equal(nuevo[0].vales, "0");
      assert.equal(importe(nuevo[0].total_pagado), "0.00");

      // Y quien SÓLO tiene vales que no movieron dinero tiene que aparecer
      // igual que quien no tiene ninguno. Es el caso que la primera versión de
      // la vista perdía: al filtrar el estado en un WHERE en vez de en los
      // agregados, la persona se quedaba sin renglones, y sin renglones no hay
      // grupo. Desaparecía entera del catálogo mientras que otra sin un solo
      // vale sí salía en ceros: dos personas igual de "sin pagos", una visible
      // y la otra no.
      const soloBorrador = await altaDePersona(esc, {
        nombre: "Taller Con Vale En Borrador",
        categoria: "PROVEEDOR",
      });
      await registrarMovimiento(esc, {
        clave: "pago-solo-borrador",
        tipo: "CACM-RCI-05",
        concepto: "PAGO_PROVEEDOR",
        importe: "4321.00",
        formaPago: "EFECTIVO",
        beneficiario: "Taller Con Vale En Borrador",
        beneficiarioPersonaId: soloBorrador,
        destino: "BORRADOR",
        esperado: null,
      });

      const { rows: enBorrador } = await esc.cx.query<{
        vales: string;
        total_pagado: string;
        ultimo_pago: Date | null;
      }>(
        "SELECT vales::text AS vales, total_pagado, ultimo_pago FROM v_pagos_por_persona WHERE persona_id = $1",
        [soloBorrador],
      );
      assert.equal(
        enBorrador.length,
        1,
        "una persona cuyo único vale sigue en borrador no puede desaparecer del catálogo",
      );
      assert.equal(enBorrador[0].vales, "0");
      assert.equal(importe(enBorrador[0].total_pagado), "0.00");
      assert.equal(enBorrador[0].ultimo_pago, null, "un borrador no es un pago con fecha");
    });
  },
);

// =====================================================================
// REGLA 7 — la diferencia de caja se explica o el día no cierra
// =====================================================================

/** Día sencillo: un cobro de venta, uno de servicio y un gasto, todos en efectivo. */
const DIA_SENCILLO: Movimiento[] = [
  {
    clave: "venta",
    tipo: "CACM-RCI-01",
    importe: "50000.33",
    destino: "FIRMADO",
    esperado: { naturaleza: "INGRESO", grupo: "VENTAS_CONTADO" },
  },
  {
    clave: "servicio",
    tipo: "CACM-RCI-04",
    importe: "3000.45",
    formaPago: "EFECTIVO",
    destino: "FIRMADO",
    esperado: { naturaleza: "INGRESO", grupo: "SERVICIO" },
  },
  {
    clave: "gasto",
    tipo: "CACM-RCI-05",
    concepto: "GASTO_OPERATIVO",
    importe: "5000.77",
    formaPago: "EFECTIVO",
    destino: "FIRMADO",
    esperado: { naturaleza: "EGRESO", grupo: "PROVEEDORES_Y_GASTOS" },
  },
];

test(
  "regla 7: un corte cuyo arqueo coincide con el saldo calculado cierra sin explicación y sin alerta",
  { skip: SIN_BASE },
  async () => {
    await conEscenario(async (esc) => {
      await sembrarDia(esc, DIA_SENCILLO);
      const corteId = await abrirCorte(esc);

      const esperado = totalesEsperados(DIA_SENCILLO);
      await cerrarCorte(esc, corteId, esperado.saldoCalculado, null);

      const fila = await leerCorte(esc, corteId);
      assert.equal(importe(fila.saldo_calculado), esperado.saldoCalculado);
      assert.equal(importe(fila.diferencia), "0.00");
      assert.equal(fila.explicacion_diferencia, null);
      assert.equal(await estadoDe(esc, corteId), "PENDIENTE_DE_FIRMA");

      // Un día que cuadra no genera ruido: la alerta es la excepción, no el
      // acuse de recibo del corte.
      assert.deepEqual(await alertasDe(esc, corteId), []);

      const espejo = arqueoCorte({
        saldoInicial: fila.saldo_inicial,
        totalIngresos: fila.total_ingresos,
        totalEgresos: fila.total_egresos,
        efectivoContado: fila.efectivo_contado ?? "0",
      });
      assert.equal(espejo?.cuadra, true);
      assert.equal(espejo?.severidadAlerta, "NINGUNA");
    });
  },
);

test(
  "regla 7: armar_corte_caja jala los importes de los folios firmados y descarta lo que no toca la caja",
  { skip: SIN_BASE },
  async () => {
    // Cada renglón declara qué debe pasar con él. El corte tiene que jalar lo
    // firmado y en efectivo, y dejar fuera lo cobrado con tarjeta, lo pagado por
    // transferencia y lo cancelado: todo eso es dinero de la empresa, pero no
    // engorda ni adelgaza el cajón.
    const DIA_COMPLETO: Movimiento[] = [
      {
        clave: "venta-contado",
        tipo: "CACM-RCI-01",
        importe: "50000.33",
        destino: "FIRMADO",
        esperado: { naturaleza: "INGRESO", grupo: "VENTAS_CONTADO" },
      },
      {
        clave: "venta-cancelada",
        tipo: "CACM-RCI-01",
        importe: "12000.00",
        destino: "CANCELADO",
        esperado: null,
      },
      {
        clave: "servicio-efectivo",
        tipo: "CACM-RCI-04",
        importe: "3000.45",
        formaPago: "EFECTIVO",
        destino: "FIRMADO",
        esperado: { naturaleza: "INGRESO", grupo: "SERVICIO" },
      },
      {
        clave: "servicio-tarjeta",
        tipo: "CACM-RCI-04",
        importe: "7500.00",
        formaPago: "TARJETA",
        destino: "FIRMADO",
        esperado: null,
      },
      {
        clave: "gasto-proveedor",
        tipo: "CACM-RCI-05",
        concepto: "GASTO_OPERATIVO",
        importe: "5000.77",
        formaPago: "EFECTIVO",
        destino: "FIRMADO",
        esperado: { naturaleza: "EGRESO", grupo: "PROVEEDORES_Y_GASTOS" },
      },
      {
        clave: "comision",
        tipo: "CACM-RCI-05",
        concepto: "COMISION_VENDEDOR",
        importe: "1500.00",
        formaPago: "EFECTIVO",
        destino: "FIRMADO",
        esperado: { naturaleza: "EGRESO", grupo: "NOMINA_Y_COMISIONES" },
      },
      {
        clave: "retiro-socio",
        tipo: "CACM-RCI-05",
        concepto: "RETIRO_UTILIDADES_SOCIO",
        importe: "8000.00",
        formaPago: "EFECTIVO",
        esDeSocio: true,
        destino: "FIRMADO",
        esperado: { naturaleza: "EGRESO", grupo: "RETIRO_SOCIOS" },
      },
      {
        clave: "pago-transferencia",
        tipo: "CACM-RCI-05",
        concepto: "PAGO_PROVEEDOR",
        importe: "9000.00",
        formaPago: "TRANSFERENCIA",
        destino: "FIRMADO",
        esperado: null,
      },
    ];

    await conEscenario(async (esc) => {
      const folios = await sembrarDia(esc, DIA_COMPLETO);
      const corteId = await abrirCorte(esc);

      // El depósito bancario y el resguardo en tránsito son efectivo que ya
      // salió del cajón: no son folios, pero sí egresos del arqueo.
      const deposito = "20000.00";
      const resguardo = "1000.00";
      await esc.cx.query(
        `INSERT INTO deposito_corte_rci07
           (corte_documento_id, institucion, cuenta, monto, fecha_deposito, comprobante_ref, registrado_por)
         VALUES ($1, 'BBVA', '0123456789', $2, $3, 'FICHA-99881', $4)`,
        [corteId, deposito, esc.hoy, esc.usuarios.custodio],
      );
      await esc.cx.query(
        `INSERT INTO resguardo_corte_rci07 (corte_documento_id, tipo, monto, detalle)
         VALUES ($1, 'TRANSITO', $2, 'Efectivo en traslado a la boveda de la matriz')`,
        [corteId, resguardo],
      );

      const fila = await armarCorte(esc, corteId);
      const esperado = totalesEsperados(DIA_COMPLETO, {
        egresosDeclarados: [deposito, resguardo],
      });

      assert.equal(importe(fila.saldo_inicial), "0.00");
      assert.equal(importe(fila.total_ingresos), esperado.ingresos);
      assert.equal(importe(fila.total_egresos), esperado.egresos);
      assert.equal(importe(fila.saldo_calculado), esperado.saldoCalculado);

      // El snapshot: un renglón por folio jalado, con la agrupación de la Parte
      // II del papel. Es lo que permite reconstruir el corte años después.
      const detalle = await detalleCorte(esc, corteId);
      const contables = DIA_COMPLETO.filter((m) => m.esperado);
      assert.equal(detalle.length, contables.length, "el snapshot debe traer sólo lo que mueve caja");
      for (const mov of contables) {
        const renglon = detalle.filter((d) => d.origen_documento_id === folios.get(mov.clave));
        assert.equal(renglon.length, 1, `falta el renglón de ${mov.clave} en el corte`);
        assert.equal(renglon[0].naturaleza, mov.esperado?.naturaleza);
        assert.equal(renglon[0].concepto_grupo, mov.esperado?.grupo);
        assert.equal(importe(renglon[0].importe), importe(mov.importe));
      }
      for (const mov of DIA_COMPLETO.filter((m) => !m.esperado)) {
        assert.equal(
          detalle.filter((d) => d.origen_documento_id === folios.get(mov.clave)).length,
          0,
          `${mov.clave} no debía entrar al corte`,
        );
      }

      // Y el arqueo que cuadra contra ese cálculo cierra el día sin diferencia.
      await cerrarCorte(esc, corteId, esperado.saldoCalculado, null);
      assert.equal(importe((await leerCorte(esc, corteId)).diferencia), "0.00");
    });
  },
);

test(
  "regla 7: un faltante sin explicación se rechaza y con explicación suficiente cierra con alerta GRAVE",
  { skip: SIN_BASE },
  async () => {
    await conEscenario(async (esc) => {
      await sembrarDia(esc, DIA_SENCILLO);
      const corteId = await abrirCorte(esc);

      const esperado = totalesEsperados(DIA_SENCILLO);
      const faltante = "-1000.00";
      const contado = importeMas(esperado.saldoCalculado, faltante);

      // Sin explicación el día no cierra: el corte es la rendición de cuentas
      // del custodio, y un faltante mudo no rinde cuenta de nada.
      await rechaza(esc, () => cerrarCorte(esc, corteId, contado, null), {
        codigo: "P0001",
        mensaje: /explica la diferencia/i,
      });

      // Una explicación demasiado corta tampoco sirve; el mínimo de la función
      // SQL es el mismo que valida la pantalla antes de mandar.
      assert.equal(explicacionDiferenciaEsSuficiente("faltante"), false);
      await rechaza(esc, () => cerrarCorte(esc, corteId, contado, "faltante"), {
        codigo: "P0001",
        mensaje: /explica la diferencia/i,
      });

      // Los rechazos no dejaron el corte a medio cerrar.
      assert.equal(await estadoDe(esc, corteId), "BORRADOR");
      assert.equal((await leerCorte(esc, corteId)).efectivo_contado, null);

      const explicacion =
        "Faltante detectado al cierre; se revisa camara de la caja y se levanta acta interna";
      assert.equal(explicacionDiferenciaEsSuficiente(explicacion), true);
      await cerrarCorte(esc, corteId, contado, explicacion);

      const fila = await leerCorte(esc, corteId);
      assert.equal(importe(fila.diferencia), "-1000.00");
      assert.equal(fila.explicacion_diferencia, explicacion);
      assert.equal(await estadoDe(esc, corteId), "PENDIENTE_DE_FIRMA");

      const alertas = await alertasDe(esc, corteId);
      assert.equal(alertas.length, 1);
      assert.equal(alertas[0].tipo, "FALTANTE_DE_CAJA");
      // GRAVE: el faltante escala al Gerente General, no se queda en un aviso.
      assert.equal(alertas[0].severidad, "GRAVE");
      assert.equal(alertas[0].sucursal_id, esc.sucursalId);
      assert.match(alertas[0].mensaje, /Faltante de 1,000\.00/);
      assert.ok(
        alertas[0].mensaje.includes(explicacion),
        "la alerta debe llevar la explicación del custodio",
      );

      const espejo = arqueoCorte({
        saldoInicial: fila.saldo_inicial,
        totalIngresos: fila.total_ingresos,
        totalEgresos: fila.total_egresos,
        efectivoContado: fila.efectivo_contado ?? "0",
      });
      assert.equal(espejo?.esFaltante, true);
      assert.equal(espejo?.severidadAlerta, "GRAVE");
    });
  },
);

test(
  "regla 7: un sobrante cierra con alerta de severidad AVISO y no GRAVE",
  { skip: SIN_BASE },
  async () => {
    await conEscenario(async (esc) => {
      await sembrarDia(esc, DIA_SENCILLO);
      const corteId = await abrirCorte(esc);

      const esperado = totalesEsperados(DIA_SENCILLO);
      const contado = importeMas(esperado.saldoCalculado, "750.50");

      // Un sobrante también exige explicación —sobra dinero que nadie declaró—
      // pero no acusa a nadie de un faltante.
      const explicacion = "Sobrante por cambio no entregado a un cliente; se localiza y se devuelve";
      await cerrarCorte(esc, corteId, contado, explicacion);

      const fila = await leerCorte(esc, corteId);
      assert.equal(importe(fila.diferencia), "750.50");

      const alertas = await alertasDe(esc, corteId);
      assert.equal(alertas.length, 1);
      assert.equal(alertas[0].tipo, "DIFERENCIA_DE_CAJA");
      assert.equal(alertas[0].severidad, "AVISO");
      assert.match(alertas[0].mensaje, /Sobrante de 750\.50/);
      assert.equal(
        alertas.filter((a) => a.severidad === "GRAVE").length,
        0,
        "un sobrante no debe escalar como faltante",
      );

      const espejo = arqueoCorte({
        saldoInicial: fila.saldo_inicial,
        totalIngresos: fila.total_ingresos,
        totalEgresos: fila.total_egresos,
        efectivoContado: fila.efectivo_contado ?? "0",
      });
      assert.equal(espejo?.esSobrante, true);
      assert.equal(espejo?.severidadAlerta, "AVISO");
    });
  },
);

test(
  "regla 7: el corte no cierra con folios del día sin firmar y el mensaje los nombra",
  { skip: SIN_BASE },
  async () => {
    await conEscenario(async (esc) => {
      const pendientes: Movimiento[] = [
        {
          clave: "vale-a-medias",
          tipo: "CACM-RCI-05",
          concepto: "GASTO_OPERATIVO",
          importe: "900.00",
          destino: "PENDIENTE_DE_FIRMA",
          esperado: null,
        },
        {
          clave: "recibo-en-borrador",
          tipo: "CACM-RCI-01",
          importe: "2500.00",
          destino: "BORRADOR",
          esperado: null,
        },
      ];
      await sembrarDia(esc, DIA_SENCILLO);
      const sinFirmar = await sembrarDia(esc, pendientes);
      const corteId = await abrirCorte(esc);

      const foliosPendientes = [
        await folioDe(esc, sinFirmar.get("vale-a-medias")!),
        await folioDe(esc, sinFirmar.get("recibo-en-borrador")!),
      ];

      const { rows: listado } = await esc.cx.query<{ folio: string; estado: string }>(
        "SELECT folio, estado FROM folios_sin_firmar_del_dia($1, $2) ORDER BY folio",
        [esc.sucursalId, esc.hoy],
      );
      assert.deepEqual(
        listado.map((f) => f.folio).sort(),
        [...foliosPendientes].sort(),
        "sólo deben quedar pendientes los dos folios sembrados sin firma",
      );

      const esperado = totalesEsperados(DIA_SENCILLO);
      const error = await rechaza(
        esc,
        () => cerrarCorte(esc, corteId, esperado.saldoCalculado, null),
        { codigo: "P0001", mensaje: /sin firmar/i },
      );
      // Nombrar los folios es la mitad del candado: sin ellos el custodio no
      // sabe qué papel le falta perseguir.
      for (const folio of foliosPendientes) {
        assert.ok(
          error.message.includes(folio),
          `el mensaje debía nombrar el folio ${folio} y dice: ${error.message}`,
        );
      }

      // Cancelados con su motivo, el folio queda ocupado y explicado, y el día
      // ya puede cerrarse. El candado era el estado de esos folios y nada más.
      for (const documentoId of sinFirmar.values()) {
        await cancelar(
          esc,
          documentoId,
          "custodio",
          "Folio capturado por error durante la operacion del dia",
        );
      }
      await cerrarCorte(esc, corteId, esperado.saldoCalculado, null);

      const fila = await leerCorte(esc, corteId);
      assert.equal(importe(fila.diferencia), "0.00");
      // Lo cancelado no entró al arqueo: cerrar no es lo mismo que contar.
      assert.equal(importe(fila.total_ingresos), esperado.ingresos);
      assert.equal(await estadoDe(esc, corteId), "PENDIENTE_DE_FIRMA");
    });
  },
);

test(
  "regla 7: el saldo inicial encadena con el efectivo contado del corte firmado anterior",
  { skip: SIN_BASE },
  async () => {
    await conEscenario(async (esc) => {
      // Día de ayer: una sola venta de contado. El corte de ayer y el de hoy no
      // chocan con la UNIQUE (sucursal, fecha, turno) porque cambia la fecha.
      const DIA_DE_AYER: Movimiento[] = [
        {
          clave: "venta-ayer",
          tipo: "CACM-RCI-01",
          importe: "20000.00",
          fecha: esc.ayer,
          destino: "FIRMADO",
          esperado: { naturaleza: "INGRESO", grupo: "VENTAS_CONTADO" },
        },
      ];
      const DIA_DE_HOY: Movimiento[] = [
        {
          clave: "venta-hoy",
          tipo: "CACM-RCI-01",
          importe: "5000.00",
          destino: "FIRMADO",
          esperado: { naturaleza: "INGRESO", grupo: "VENTAS_CONTADO" },
        },
      ];

      await sembrarDia(esc, DIA_DE_AYER);
      await sembrarDia(esc, DIA_DE_HOY);

      const corteAyer = await abrirCorte(esc, { fecha: esc.ayer });
      const esperadoAyer = totalesEsperados(DIA_DE_AYER);
      const contadoAyer = esperadoAyer.saldoCalculado;
      await cerrarCorte(esc, corteAyer, contadoAyer, null);
      assert.equal(importe((await leerCorte(esc, corteAyer)).diferencia), "0.00");

      // Mientras el corte de ayer sólo esté cerrado, no encadena: el saldo con
      // el que abre el día lo respalda una firma, no un borrador cerrado.
      assert.equal(await saldoInicialDe(esc, esc.hoy), "0.00");

      assert.equal(await firmarCorte(esc, corteAyer), "FIRMADO");
      assert.equal(await saldoInicialDe(esc, esc.hoy), contadoAyer);

      // Y el corte de hoy arranca de ahí sin que nadie teclee el saldo inicial.
      const corteHoy = await abrirCorte(esc, { fecha: esc.hoy });
      const fila = await armarCorte(esc, corteHoy);
      assert.equal(importe(fila.saldo_inicial), contadoAyer);

      const esperadoHoy = totalesEsperados(DIA_DE_HOY, { saldoInicial: contadoAyer });
      assert.equal(importe(fila.total_ingresos), esperadoHoy.ingresos);
      assert.equal(importe(fila.saldo_calculado), esperadoHoy.saldoCalculado);

      await cerrarCorte(esc, corteHoy, esperadoHoy.saldoCalculado, null);
      assert.equal(importe((await leerCorte(esc, corteHoy)).diferencia), "0.00");
      assert.deepEqual(await alertasDe(esc, corteHoy), []);
    });
  },
);

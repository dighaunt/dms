import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const MIGRATIONS_DIR = path.join(process.cwd(), "migrations");
const RECONCILIABLE = [
  "016_cierre_expediente.sql",
  "017_anulacion_excepcional_opcionales.sql",
  "018_anulacion_excepcional_general.sql",
  "019_retirar_anulacion_opcional_especifica.sql",
  "020_anulacion_excepcional_en_candados.sql",
];
const checkOnly = process.argv.includes("--check");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL no está definida (usa .env o exporta la variable).");
  process.exit(1);
}

const client = new pg.Client({ connectionString: databaseUrl });

function checksum(sql) {
  return createHash("sha256").update(sql).digest("hex");
}

function fail(message) {
  throw new Error(`No se reconcilió el historial: ${message}`);
}

async function assertRelations() {
  const expected = new Map([
    ["traza.archivo_escaneado_legacy", "r"],
    ["traza.archivo_escaneado", "v"],
    ["traza.documento_adjunto", "r"],
    ["traza.expediente_cierre", "r"],
    ["traza.anulacion_documental_excepcional", "r"],
    ["public.anulaciones_documentales_excepcionales", "v"],
  ]);
  const { rows } = await client.query(`
    SELECT n.nspname || '.' || c.relname AS nombre, c.relkind
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE (n.nspname, c.relname) IN (
       ('traza', 'archivo_escaneado_legacy'),
       ('traza', 'archivo_escaneado'),
       ('traza', 'documento_adjunto'),
       ('traza', 'expediente_cierre'),
       ('traza', 'anulacion_documental_excepcional'),
       ('public', 'anulaciones_documentales_excepcionales')
     )
  `);
  const actual = new Map(rows.map((row) => [row.nombre, row.relkind]));
  for (const [nombre, relkind] of expected) {
    if (actual.get(nombre) !== relkind) {
      fail(`falta ${nombre} con tipo ${relkind}.`);
    }
  }
}

async function assertColumns() {
  const expected = new Map([
    ["traza.documento_adjunto", [
      "id:bigint", "documento_id:bigint", "nombre_archivo:text", "content_type:text",
      "sha256:text", "ruta_objeto:text", "tamano_bytes:bigint", "subido_por:bigint",
      "subido_en:timestamp with time zone",
    ]],
    ["traza.expediente_cierre", [
      "expediente_id:bigint", "cerrado_por:bigint", "cerrado_en:timestamp with time zone",
    ]],
  ]);
  const { rows } = await client.query(`
    SELECT table_schema || '.' || table_name AS tabla, column_name, data_type
      FROM information_schema.columns
     WHERE (table_schema, table_name) IN (
       ('traza', 'documento_adjunto'), ('traza', 'expediente_cierre')
     )
     ORDER BY table_schema, table_name, ordinal_position
  `);
  const actual = new Map();
  for (const row of rows) {
    const columns = actual.get(row.tabla) ?? [];
    columns.push(`${row.column_name}:${row.data_type}`);
    actual.set(row.tabla, columns);
  }
  for (const [tabla, columns] of expected) {
    if (actual.get(tabla)?.join("|") !== columns.join("|")) {
      fail(`las columnas de ${tabla} no coinciden con las postcondiciones auditadas.`);
    }
  }
}

async function assertConstraints() {
  const { rows } = await client.query(`
    SELECT c.conrelid::regclass::text AS tabla, c.conname
      FROM pg_constraint c
     WHERE c.conrelid IN (
       'traza.documento_adjunto'::regclass,
       'traza.anulacion_documental_excepcional'::regclass
     )
  `);
  const names = new Set(rows.map((row) => `${row.tabla}:${row.conname}`));
  const required = [
    "traza.documento_adjunto:documento_adjunto_documento_id_sha256_key",
    "traza.documento_adjunto:documento_adjunto_ruta_objeto_key",
    "traza.anulacion_documental_excepcional:anulacion_documental_excepcional_tipo_fk",
  ];
  for (const name of required) {
    if (!names.has(name)) fail(`falta la restricción ${name}.`);
  }
  if (names.has("traza.anulacion_documental_excepcional:anulacion_documental_excepcional_tipo_codigo_check")) {
    fail("sigue activa la restricción obsoleta de F-09/F-10.");
  }
}

async function assertFunctions() {
  const { rows } = await client.query(`
    SELECT p.proname, pg_get_functiondef(p.oid) AS definicion
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'traza'
       AND p.proname IN (
         'anular_documento_excepcional',
         'anular_documento_opcional_excepcional',
         'requisito_anulado_excepcional',
         'cerrar_expediente',
         'cambiar_estado_unidad'
       )
  `);
  const actual = new Map(rows.map((row) => [row.proname, row.definicion]));
  const general = actual.get("anular_documento_excepcional");
  const requisito = actual.get("requisito_anulado_excepcional");
  const cierre = actual.get("cerrar_expediente");
  const estados = actual.get("cambiar_estado_unidad");
  if (!general?.includes("al menos 40 caracteres")) {
    fail("no está instalada la función general de anulación excepcional de 018.");
  }
  if (!requisito?.includes("SELECT EXISTS")) {
    fail("falta la función que resuelve requisitos anulados excepcionalmente.");
  }
  if (!cierre?.includes("requisito_anulado_excepcional")) {
    fail("el cierre de expediente no consume anulaciones excepcionales.");
  }
  const usosEnCandados = estados?.match(/requisito_anulado_excepcional/g)?.length ?? 0;
  if (usosEnCandados !== 9) {
    fail("los candados de estado no coinciden con la versión de anulación excepcional auditada.");
  }
  if (actual.has("anular_documento_opcional_excepcional")) {
    fail("sigue expuesta la función opcional obsoleta que 019 debía retirar.");
  }
}

async function assertViews() {
  const { rows } = await client.query(`
    SELECT c.relname, pg_get_viewdef(c.oid, true) AS definicion
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname IN ('expedientes', 'documentos')
  `);
  const actual = new Map(rows.map((row) => [row.relname, row.definicion]));
  if (!actual.get("expedientes")?.includes("cerrado")) {
    fail("la vista pública de expedientes no expone el cierre de 016.");
  }
  if (!actual.get("documentos")?.includes("pdf_completado")) {
    fail("la vista pública de documentos no expone el estado de captura de 016.");
  }
}

async function assertPostconditions() {
  await assertRelations();
  await assertColumns();
  await assertConstraints();
  await assertFunctions();
  await assertViews();
}

async function loadMigrations() {
  const files = (await readdir(MIGRATIONS_DIR))
    .filter((file) => /^\d{3}_.+\.sql$/.test(file))
    .sort();
  const source = new Map();
  for (const file of files) {
    source.set(file, checksum(await readFile(path.join(MIGRATIONS_DIR, file), "utf8")));
  }
  return source;
}

async function main() {
  await client.connect();
  await client.query("SELECT pg_advisory_lock(hashtext('dms:migration-ledger'))");
  try {
    const hashes = await loadMigrations();
    for (const file of RECONCILIABLE) {
      if (!hashes.has(file)) fail(`no existe ${file} en el repositorio.`);
    }

    const ledgerExists = (await client.query(`
      SELECT to_regclass('public._migrations') IS NOT NULL AS existe
    `)).rows[0].existe;
    if (!ledgerExists) fail("no existe la tabla public._migrations.");

    const hasChecksum = (await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = '_migrations'
           AND column_name = 'checksum_sha256'
      ) AS existe
    `)).rows[0].existe;
    const { rows: ledgerRows } = await client.query(
      `SELECT nombre, ${hasChecksum ? "checksum_sha256" : "NULL::text AS checksum_sha256"}
         FROM public._migrations ORDER BY nombre`,
    );
    const ledger = new Map(ledgerRows.map((row) => [row.nombre, row.checksum_sha256?.trim() ?? null]));
    for (const nombre of ledger.keys()) {
      if (!hashes.has(nombre)) fail(`el ledger contiene ${nombre}, que no existe en migrations/.`);
    }

    const historical = [...hashes.keys()].filter((file) => !RECONCILIABLE.includes(file));
    const missingHistorical = historical.filter((file) => !ledger.has(file));
    if (missingHistorical.length) {
      fail(`faltan migraciones históricas registradas: ${missingHistorical.join(", ")}.`);
    }
    const registeredReconciliable = RECONCILIABLE.filter((file) => ledger.has(file));
    if (registeredReconciliable.length && registeredReconciliable.length !== RECONCILIABLE.length) {
      fail(`el ledger contiene una reconciliación parcial: ${registeredReconciliable.join(", ")}.`);
    }

    await assertPostconditions();
    if (checkOnly) {
      console.log("Postcondiciones 016–020 validadas; el ledger no fue modificado.");
      return;
    }

    await client.query("BEGIN");
    await client.query(`
      ALTER TABLE public._migrations
      ADD COLUMN IF NOT EXISTS checksum_sha256 char(64)
    `);
    for (const [file, hash] of hashes) {
      if (ledger.has(file)) {
        const recorded = ledger.get(file);
        if (recorded && recorded !== hash) {
          fail(`el checksum ya registrado para ${file} no coincide con el archivo local.`);
        }
        await client.query(
          `UPDATE public._migrations
              SET checksum_sha256 = $2
            WHERE nombre = $1 AND checksum_sha256 IS NULL`,
          [file, hash],
        );
      } else {
        await client.query(
          "INSERT INTO public._migrations (nombre, checksum_sha256) VALUES ($1, $2)",
          [file, hash],
        );
      }
    }
    await client.query("COMMIT");
    console.log("Historial reconciliado: 016–020 se registraron tras validar sus postcondiciones; todos los registros llevan checksum.");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('dms:migration-ledger'))").catch(() => {});
  }
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => client.end());

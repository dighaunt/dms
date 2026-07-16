import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const MIGRATIONS_DIR = path.join(process.cwd(), "migrations");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL no está definida (usa .env o exporta la variable).");
  process.exit(1);
}

const client = new pg.Client({ connectionString: databaseUrl });

function checksum(sql) {
  return createHash("sha256").update(sql).digest("hex");
}

async function main() {
  await client.connect();
  await client.query("SELECT pg_advisory_lock(hashtext('dms:migration-ledger'))");

  await client.query(`
    CREATE TABLE IF NOT EXISTS public._migrations (
      nombre      text PRIMARY KEY,
      aplicada_en timestamptz NOT NULL DEFAULT now(),
      checksum_sha256 char(64)
    )
  `);
  const { rows: checksumColumn } = await client.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = '_migrations'
         AND column_name = 'checksum_sha256'
    ) AS existe
  `);
  if (!checksumColumn[0].existe) {
    const { rows: ledgerCount } = await client.query(
      "SELECT count(*)::int AS total FROM public._migrations",
    );
    if (ledgerCount[0].total > 0) {
      throw new Error(
        "El historial existente no tiene checksums. Ejecuta primero npm run db:reconcile-ledger; db:migrate no alterará ese ledger sin una verificación explícita.",
      );
    }
    await client.query(`
      ALTER TABLE public._migrations
      ADD COLUMN checksum_sha256 char(64)
    `);
  }

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => /^\d{3}_.+\.sql$/.test(f))
    .sort();

  const { rows } = await client.query(
    "SELECT nombre, checksum_sha256 FROM public._migrations",
  );
  const applied = new Map(rows.map((r) => [r.nombre, r.checksum_sha256?.trim() ?? null]));

  let count = 0;
  for (const file of files) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
    const expectedChecksum = checksum(sql);
    const recordedChecksum = applied.get(file);
    if (recordedChecksum !== undefined) {
      if (!recordedChecksum) {
        throw new Error(
          `La migración ${file} no tiene checksum. Ejecuta primero npm run db:reconcile-ledger para revisar y reconciliar el historial.`,
        );
      }
      if (recordedChecksum !== expectedChecksum) {
        throw new Error(
          `El archivo ${file} no coincide con el checksum registrado en la base de datos. No se aplicará ningún cambio.`,
        );
      }
      console.log(`- ${file} (ya aplicada)`);
      continue;
    }
    console.log(`> aplicando ${file}...`);
    try {
      // El archivo controla su propia transacción (BEGIN/COMMIT).
      await client.query(sql);
      await client.query(
        "INSERT INTO public._migrations (nombre, checksum_sha256) VALUES ($1, $2)",
        [file, expectedChecksum],
      );
      count += 1;
      console.log(`[OK] ${file}`);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(`[ERROR] ${file} falló: ${error.message}`);
      process.exitCode = 1;
      break;
    }
  }

  console.log(count === 0 ? "Sin migraciones pendientes." : `${count} migración(es) aplicada(s).`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "No fue posible ejecutar las migraciones.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.query("SELECT pg_advisory_unlock(hashtext('dms:migration-ledger'))").catch(() => {});
    await client.end();
  });

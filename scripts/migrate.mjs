import { readFile, readdir } from "node:fs/promises";
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

async function main() {
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS public._migrations (
      nombre      text PRIMARY KEY,
      aplicada_en timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => /^\d{3}_.+\.sql$/.test(f))
    .sort();

  const { rows } = await client.query("SELECT nombre FROM public._migrations");
  const applied = new Set(rows.map((r) => r.nombre));

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`- ${file} (ya aplicada)`);
      continue;
    }
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
    console.log(`> aplicando ${file}...`);
    try {
      // El archivo controla su propia transacción (BEGIN/COMMIT).
      await client.query(sql);
      await client.query("INSERT INTO public._migrations (nombre) VALUES ($1)", [file]);
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
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => client.end());

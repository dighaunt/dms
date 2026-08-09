import {
  Pool,
  type PoolClient,
  type QueryResult,
  type QueryResultRow,
} from "pg";

import { env } from "@/lib/env";

const globalForDb = globalThis as typeof globalThis & {
  dmsPgPool?: Pool;
};

export const pool =
  globalForDb.dmsPgPool ??
  new Pool({
    connectionString: env.DATABASE_URL,
    max: 10,

    
    idleTimeoutMillis: 30_000,

    connectionTimeoutMillis: 10_000,
  });

pool.on("error", (error) => {
  console.error("[db] conexión ociosa perdida; el pozo abrirá otra", error);
});

if (process.env.NODE_ENV !== "production") {
  globalForDb.dmsPgPool = pool;
}

export function query<Row extends QueryResultRow = QueryResultRow>(
  text: string,
  values: readonly unknown[] = [],
): Promise<QueryResult<Row>> {
  return pool.query<Row>(text, [...values]);
}

export async function withTransaction<Result>(
  callback: (client: PoolClient) => Promise<Result>,
): Promise<Result> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {

    
    
    try {
      await client.query("ROLLBACK");
    } catch (errorAlRevertir) {
      console.error("[db] no se pudo revertir la transacción", errorAlRevertir);
    }
    throw error;
  } finally {
    client.release();
  }
}

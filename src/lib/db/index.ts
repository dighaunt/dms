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

// no crear un Pool nuevo por request en entornos serverless — reusar esta instancia.
export const pool =
  globalForDb.dmsPgPool ??
  new Pool({
    connectionString: env.DATABASE_URL,
    max: 10,
    // Neon suspende el compute cuando no hay tráfico. Cerrar antes las
    // conexiones ociosas hace que la reanudación la pague una conexión nueva
    // —que sabe reconectar— y no una del pozo que se quedó muerta.
    idleTimeoutMillis: 30_000,
    // Sin esto, una reanudación lenta deja la petición colgada hasta que el
    // propio serverless la corta, y el usuario ve una página que nunca llega.
    connectionTimeoutMillis: 10_000,
  });

/**
 * Un pozo de conexiones emite `error` cuando se le muere un cliente OCIOSO, y
 * ese evento no lo recibe ninguna consulta porque no hay ninguna en curso. En
 * Node, un evento `error` sin oyente no se ignora: se lanza. Y como se lanza
 * fuera de todo `try`, tumba el proceso entero.
 *
 * Eso es exactamente lo que pasaba en producción. Neon suspende el compute por
 * inactividad y corta las conexiones abiertas con un `57P01 terminating
 * connection due to administrator command`; el pozo lo emitía, nadie lo
 * escuchaba, y la función se caía con `exit status 129`. El usuario no veía un
 * error de base de datos: veía "esta página no se pudo cargar", porque para
 * cuando el navegador preguntaba ya no había proceso a quien preguntarle.
 *
 * Escucharlo lo vuelve lo que siempre debió ser: una conexión que se perdió. El
 * pozo la descarta y abre otra en la siguiente consulta. Se registra porque un
 * pico de estos SÍ dice algo —que el compute se está suspendiendo demasiado, o
 * que se están agotando las conexiones—, pero no debe interrumpir a nadie.
 */
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
    // El ROLLBACK puede fallar por sí mismo —si la conexión ya murió, que es
    // justo cuando más falta hace—, y si se le deja lanzar SUSTITUYE al error
    // original. Quien lee el registro vería "conexión terminada" en lugar de
    // "el arqueo no cuadra", y estaría depurando el síntoma equivocado.
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

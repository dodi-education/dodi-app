/**
 * Minimal Kysely dialect over PGlite (Postgres in WASM) for tests. Kept
 * in-repo because published PGlite dialects lag behind Kysely's module
 * layout. Single connection, serialized through PGlite's own query queue.
 */
import { PGlite, types } from "@electric-sql/pglite";
import {
  CompiledQuery,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type DatabaseConnection,
  type Dialect,
  type Driver,
  type QueryResult,
} from "kysely";

/** Same wire shapes as src/lib/db.ts: ISO-string timestamps, numeric ids. */
const PARSERS = {
  [types.INT8]: (v: string) => Number(v),
  [types.NUMERIC]: (v: string) => Number(v),
  [types.DATE]: (v: string) => v,
  [types.TIMESTAMP]: (v: string) => new Date(`${v}Z`).toISOString(),
  [types.TIMESTAMPTZ]: (v: string) => new Date(v).toISOString(),
};

class PGliteConnection implements DatabaseConnection {
  constructor(private readonly client: PGlite) {}

  async executeQuery<R>(compiled: CompiledQuery): Promise<QueryResult<R>> {
    if (compiled.parameters.length === 0) {
      // Simple protocol: allows multi-statement scripts (migration files).
      const results = await this.client.exec(compiled.sql);
      const last = results[results.length - 1];
      return {
        rows: (last?.rows ?? []) as R[],
        numAffectedRows: BigInt(last?.affectedRows ?? 0),
      };
    }
    const result = await this.client.query<R>(compiled.sql, [
      ...compiled.parameters,
    ]);
    return {
      rows: result.rows,
      numAffectedRows: BigInt(result.affectedRows ?? 0),
    };
  }

  // eslint-disable-next-line require-yield
  async *streamQuery(): AsyncIterableIterator<never> {
    throw new Error("PGlite dialect does not support streaming");
  }
}

class PGliteDriver implements Driver {
  readonly #connection: PGliteConnection;

  constructor(client: PGlite) {
    this.#connection = new PGliteConnection(client);
  }

  async init(): Promise<void> {}

  async acquireConnection(): Promise<DatabaseConnection> {
    return this.#connection;
  }

  async beginTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw("begin"));
  }

  async commitTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw("commit"));
  }

  async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw("rollback"));
  }

  async releaseConnection(): Promise<void> {}

  async destroy(): Promise<void> {}
}

export async function createPGlite(): Promise<PGlite> {
  return PGlite.create({ parsers: PARSERS });
}

export function pgliteDialect(client: PGlite): Dialect {
  return {
    createDriver: () => new PGliteDriver(client),
    createQueryCompiler: () => new PostgresQueryCompiler(),
    createAdapter: () => new PostgresAdapter(),
    createIntrospector: (db) => new PostgresIntrospector(db),
  };
}

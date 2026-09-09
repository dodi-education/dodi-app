import {
  CompiledQuery,
  Kysely,
  PostgresAdapter,
  PostgresDriver,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type DatabaseConnection,
  type Dialect,
  type Driver,
  type TransactionSettings,
} from "kysely";
import { Pool, types as pgTypes } from "pg";

import type { Database } from "@dodi/types/database";

/**
 * Database access for the platform: one Postgres, two roles.
 *
 *  - `serviceDb`          runs as `dodi_service` (BYPASSRLS). Cross-account
 *                         operations, device-authenticated requests, jobs. Every
 *                         query MUST be scoped to the resolved account in app
 *                         code, exactly like the former service-role client.
 *  - `scopedDb(account)`  runs as `dodi_app` (RLS enforced). Each checked-out
 *                         connection carries `app.account_id`, which the RLS
 *                         policies read through `app.current_account_id()`, so
 *                         user-authenticated queries stay isolated per account
 *                         without an explicit account filter on every query.
 *
 * Wire shapes match what PostgREST used to return: timestamps are ISO strings,
 * bigints (count(*)) and numerics are JS numbers.
 */

export type Db = Kysely<Database>;

const OID_INT8 = 20;
const OID_NUMERIC = 1700;
const OID_DATE = 1082;
const OID_TIMESTAMP = 1114;
const OID_TIMESTAMPTZ = 1184;

pgTypes.setTypeParser(OID_INT8, (value) => Number(value));
pgTypes.setTypeParser(OID_NUMERIC, (value) => Number(value));
pgTypes.setTypeParser(OID_DATE, (value) => value);
pgTypes.setTypeParser(OID_TIMESTAMPTZ, (value) => new Date(value).toISOString());
pgTypes.setTypeParser(OID_TIMESTAMP, (value) =>
  new Date(`${value}Z`).toISOString(),
);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set on the platform server. Add it to platform/.env.local ` +
        "(see .env.local.example) and restart the platform server.",
    );
  }
  return value;
}

const pools = new Map<string, Pool>();

function pool(envName: string): Pool {
  let existing = pools.get(envName);
  if (!existing) {
    existing = new Pool({
      connectionString: requireEnv(envName),
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      idleTimeoutMillis: 30_000,
    });
    pools.set(envName, existing);
  }
  return existing;
}

/**
 * Driver wrapper that stamps `app.account_id` onto every connection it hands
 * out and clears it on release, so pooled connections never leak an identity
 * into the next request. A failed reset destroys the connection instead of
 * returning it to the pool.
 */
class ScopedPostgresDriver implements Driver {
  readonly #inner: Driver;
  readonly #accountId: string;

  constructor(inner: Driver, accountId: string) {
    this.#inner = inner;
    this.#accountId = accountId;
  }

  init(): Promise<void> {
    return this.#inner.init();
  }

  async acquireConnection(): Promise<DatabaseConnection> {
    const connection = await this.#inner.acquireConnection();
    try {
      await connection.executeQuery(
        CompiledQuery.raw("select set_config('app.account_id', $1, false)", [
          this.#accountId,
        ]),
      );
    } catch (error) {
      await this.#inner.releaseConnection(connection);
      throw error;
    }
    return connection;
  }

  beginTransaction(
    connection: DatabaseConnection,
    settings: TransactionSettings,
  ): Promise<void> {
    return this.#inner.beginTransaction(connection, settings);
  }

  commitTransaction(connection: DatabaseConnection): Promise<void> {
    return this.#inner.commitTransaction(connection);
  }

  rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    return this.#inner.rollbackTransaction(connection);
  }

  async releaseConnection(connection: DatabaseConnection): Promise<void> {
    try {
      await connection.executeQuery(CompiledQuery.raw("reset app.account_id"));
    } catch {
      // The connection is in an unknown state: drop it rather than pool it.
      // pg's client-level error handling closes it on the next failure; force
      // the issue by ending the underlying client if we can reach it.
      const client = (connection as { client?: { release?: (e?: Error) => void } })
        .client;
      client?.release?.(new Error("scoped connection reset failed"));
      return;
    }
    await this.#inner.releaseConnection(connection);
  }

  destroy(): Promise<void> {
    // The pool is shared and process-lived; scoped instances never own it.
    return Promise.resolve();
  }
}

/**
 * Dialect on the given pool env var. The pool is created on first use (pg's
 * PostgresDriver accepts a factory), so importing this module never touches
 * env: tests, `next build` and the Better Auth CLI can load it freely.
 */
function postgresDialect(envName: string): Dialect {
  return {
    createDriver: () =>
      new PostgresDriver({ pool: async () => pool(envName) }),
    createQueryCompiler: () => new PostgresQueryCompiler(),
    createAdapter: () => new PostgresAdapter(),
    createIntrospector: (db) => new PostgresIntrospector(db),
  };
}

/** Dialect for the RLS-enforced `dodi_app` pool, stamped with one account. */
export function scopedDialect(accountId: string): Dialect {
  const base = postgresDialect("DATABASE_URL_APP");
  return {
    ...base,
    createDriver: () => new ScopedPostgresDriver(base.createDriver(), accountId),
  };
}

/** Dialect for the BYPASSRLS `dodi_service` pool (also used by Better Auth). */
export function serviceDialect(): Dialect {
  return postgresDialect("DATABASE_URL_SERVICE");
}

/** BYPASSRLS connection for cross-account, device and job work. */
export const serviceDb: Db = new Kysely<Database>({ dialect: serviceDialect() });

/** RLS-enforced connection acting as `accountId` (a Better Auth user id). */
export function scopedDb(accountId: string): Db {
  if (!UUID_RE.test(accountId)) {
    throw new Error("scopedDb: accountId must be a UUID");
  }
  return new Kysely<Database>({ dialect: scopedDialect(accountId) });
}

/** Close all pools (tests, graceful shutdown). */
export async function closeDbPools(): Promise<void> {
  await Promise.all([...pools.values()].map((p) => p.end()));
  pools.clear();
}

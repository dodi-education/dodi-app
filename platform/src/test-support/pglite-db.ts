/**
 * Real-Postgres test database: PGlite (Postgres compiled to WASM, in-memory)
 * with the actual baseline migration + dev seed applied, so service tests run
 * against the real schema, functions, triggers and RLS policies.
 *
 *   const t = await createTestDb();
 *   const accountId = await t.createAccount("parent@example.com");
 *   await listKids(t.scopedDb(accountId), accountId);   // RLS-enforced, as dodi_app
 *   await t.serviceDb.selectFrom("kids")...              // BYPASSRLS, as the owner
 *   await t.close();
 *
 * Boot once per test file (beforeAll) — applying the baseline takes ~1s.
 */
import {
  CompiledQuery,
  Kysely,
  type DatabaseConnection,
  type Driver,
  type TransactionSettings,
} from "kysely";

import type { Database } from "@dodi/types/database";

import { createMigrator, runSeeds } from "../../db/migrate";
import { createPGlite, pgliteDialect } from "./pglite-dialect";

export type TestDb = Kysely<Database>;

export interface TestDatabase {
  /** BYPASSRLS handle (owner) — seed rows, assert on state. */
  serviceDb: TestDb;
  /** RLS-enforced handle acting as `accountId` (role dodi_app). */
  scopedDb: (accountId: string) => TestDb;
  /** Insert an auth user (+ account via handle_new_user) and return its id. */
  createAccount: (
    email: string,
    options?: { inviteCode?: string; emailVerified?: boolean },
  ) => Promise<string>;
  close: () => Promise<void>;
}

/** Sets role + account on the single PGlite connection for the scoped handle. */
class ScopedTestDriver implements Driver {
  constructor(
    private readonly inner: Driver,
    private readonly accountId: string,
  ) {}

  init(): Promise<void> {
    return this.inner.init();
  }

  async acquireConnection(): Promise<DatabaseConnection> {
    const connection = await this.inner.acquireConnection();
    await connection.executeQuery(CompiledQuery.raw("set role dodi_app"));
    await connection.executeQuery(
      CompiledQuery.raw("select set_config('app.account_id', $1, false)", [
        this.accountId,
      ]),
    );
    return connection;
  }

  beginTransaction(c: DatabaseConnection, s: TransactionSettings): Promise<void> {
    return this.inner.beginTransaction(c, s);
  }

  commitTransaction(c: DatabaseConnection): Promise<void> {
    return this.inner.commitTransaction(c);
  }

  rollbackTransaction(c: DatabaseConnection): Promise<void> {
    return this.inner.rollbackTransaction(c);
  }

  async releaseConnection(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw("reset app.account_id"));
    await connection.executeQuery(CompiledQuery.raw("reset role"));
    await this.inner.releaseConnection(connection);
  }

  destroy(): Promise<void> {
    return Promise.resolve();
  }
}

export async function createTestDb(): Promise<TestDatabase> {
  const client = await createPGlite();
  const dialect = pgliteDialect(client);
  const serviceDb = new Kysely<Database>({ dialect });

  const { error } = await createMigrator(
    serviceDb as unknown as Kysely<unknown>,
  ).migrateToLatest();
  if (error) throw error;
  await runSeeds(serviceDb as unknown as Kysely<unknown>);

  const scopedDb = (accountId: string): TestDb =>
    new Kysely<Database>({
      dialect: {
        ...dialect,
        createDriver: () => new ScopedTestDriver(dialect.createDriver(), accountId),
        createQueryCompiler: () => dialect.createQueryCompiler(),
        createAdapter: () => dialect.createAdapter(),
        createIntrospector: (db) => dialect.createIntrospector(db),
      },
    });

  const createAccount: TestDatabase["createAccount"] = async (email, options) => {
    const { id } = await serviceDb
      .insertInto("auth_users")
      .values({
        name: email,
        email,
        email_verified: options?.emailVerified ?? true,
        invite_code: options?.inviteCode ?? null,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    return id;
  };

  return {
    serviceDb,
    scopedDb,
    createAccount,
    close: async () => {
      await serviceDb.destroy();
      await client.close();
    },
  };
}

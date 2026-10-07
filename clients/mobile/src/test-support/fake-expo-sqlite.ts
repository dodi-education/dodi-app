/**
 * `expo-sqlite`'s async database API over Node's built-in SQLite (real SQL,
 * in memory) for Node tests:
 *
 *   vi.mock("expo-sqlite", () => import("@/test-support/fake-expo-sqlite"));
 *
 * A database name opens the same in-memory database for the whole test file
 * (like a file on the device), so a new backend instance sees earlier writes.
 */

type SqlValue = string | number | bigint | null | Uint8Array;

interface NodeStatement {
  run(...params: SqlValue[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  get(...params: SqlValue[]): unknown;
  all(...params: SqlValue[]): unknown[];
}

interface NodeDatabase {
  exec(sql: string): void;
  prepare(sql: string): NodeStatement;
}

// Through a variable: the app's TypeScript setup has no `node:sqlite` typings.
const NODE_SQLITE = "node:sqlite";
const { DatabaseSync } = (await import(/* @vite-ignore */ NODE_SQLITE)) as {
  DatabaseSync: new (path: string) => NodeDatabase;
};

const databases = new Map<string, NodeDatabase>();
let isFailing = false;

/** Every query rejects from now on (a corrupt or full disk), until the next reset. */
export function failSqliteDatabases(): void {
  isFailing = true;
}

function check(): void {
  if (isFailing) throw new Error("fake expo-sqlite: database unavailable");
}

/** Empty every table of every database (a fresh install, handles stay valid). */
export function resetSqliteDatabases(): void {
  isFailing = false;
  for (const db of databases.values()) {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[];
    for (const { name } of tables) db.exec(`DELETE FROM "${name}"`);
  }
}

/** Every row of every table as text (for "never stored in plaintext" checks). */
export function dumpSqliteDatabases(): string {
  const out: string[] = [];
  for (const [file, db] of databases) {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[];
    for (const { name } of tables) {
      for (const row of db.prepare(`SELECT * FROM "${name}"`).all()) out.push(`${file}/${name} ${JSON.stringify(row)}`);
    }
  }
  return out.join("\n");
}

type Params = SqlValue[];

function bind(params?: Params | SqlValue): SqlValue[] {
  if (params === undefined) return [];
  return Array.isArray(params) ? params : [params];
}

function database(name: string) {
  let db = databases.get(name);
  if (!db) {
    db = new DatabaseSync(":memory:");
    databases.set(name, db);
  }
  const sqlite = db;
  return {
    databasePath: name,
    async execAsync(sql: string): Promise<void> {
      check();
      sqlite.exec(sql);
    },
    async runAsync(sql: string, params?: Params | SqlValue) {
      check();
      const result = sqlite.prepare(sql).run(...bind(params));
      return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
    },
    async getFirstAsync<T>(sql: string, params?: Params | SqlValue): Promise<T | null> {
      check();
      return (sqlite.prepare(sql).get(...bind(params)) as T | undefined) ?? null;
    },
    async getAllAsync<T>(sql: string, params?: Params | SqlValue): Promise<T[]> {
      check();
      return sqlite.prepare(sql).all(...bind(params)) as T[];
    },
    async closeAsync(): Promise<void> {},
  };
}

export async function openDatabaseAsync(name: string) {
  return database(name);
}

export function openDatabaseSync(name: string) {
  return database(name);
}

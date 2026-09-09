/**
 * Plain-SQL migration runner for the platform database.
 *
 *   pnpm db:migrate            apply every pending file in db/migrations
 *   pnpm db:migrate -- --down  roll back the latest applied migration
 *
 * Migrations are timestamped `.sql` files (`YYYYMMDDHHMMSS_description.sql`).
 * The whole file is the forward migration; an optional `-- reverse:` marker
 * splits off the statements that undo it. Bookkeeping lives in Kysely's
 * `kysely_migration` table. Connects as the schema owner (DATABASE_URL_MIGRATOR).
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Kysely, PostgresDialect, sql } from "kysely";
import { Migrator, type Migration, type MigrationProvider } from "kysely/migration";
import { Pool } from "pg";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = path.join(HERE, "migrations");
export const SEED_DIR = path.join(HERE, "seed");

const REVERSE_MARKER = /^\s*--\s*reverse:\s*$/m;

/** Split a migration file into its forward and (optional) reverse SQL. */
export function splitMigration(contents: string): {
  up: string;
  down: string | null;
} {
  const match = REVERSE_MARKER.exec(contents);
  if (!match) return { up: contents, down: null };
  const up = contents.slice(0, match.index);
  const down = contents
    .slice(match.index + match[0].length)
    // Reverse sections are commented out so the file stays a valid forward
    // migration; strip one leading "-- " per line to activate them.
    .replace(/^--\s?/gm, "");
  return { up, down: down.trim() ? down : null };
}

/** Reads `*.sql` files from a directory, sorted by name (timestamp prefix). */
export class SqlFileMigrationProvider implements MigrationProvider {
  constructor(private readonly dir: string) {}

  async getMigrations(): Promise<Record<string, Migration>> {
    const files = (await readdir(this.dir))
      .filter((f) => f.endsWith(".sql"))
      .sort();
    const migrations: Record<string, Migration> = {};
    for (const file of files) {
      const contents = await readFile(path.join(this.dir, file), "utf8");
      const { up, down } = splitMigration(contents);
      migrations[file.replace(/\.sql$/, "")] = {
        up: async (db) => {
          await sql.raw(up).execute(db);
        },
        down: down
          ? async (db) => {
              await sql.raw(down).execute(db);
            }
          : undefined,
      };
    }
    return migrations;
  }
}

export function createMigrator(db: Kysely<unknown>, dir = MIGRATIONS_DIR): Migrator {
  return new Migrator({
    db,
    provider: new SqlFileMigrationProvider(dir),
    allowUnorderedMigrations: false,
  });
}

/** Apply every seed file in db/seed (idempotent SQL, sorted by name). */
export async function runSeeds(db: Kysely<unknown>, dir = SEED_DIR): Promise<string[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    await sql.raw(await readFile(path.join(dir, file), "utf8")).execute(db);
  }
  return files;
}

export function migratorDb(url = process.env.DATABASE_URL_MIGRATOR): Kysely<unknown> {
  if (!url) throw new Error("DATABASE_URL_MIGRATOR is not set");
  return new Kysely<unknown>({
    dialect: new PostgresDialect({ pool: new Pool({ connectionString: url, max: 1 }) }),
  });
}

async function main(): Promise<void> {
  const down = process.argv.includes("--down");
  const db = migratorDb();
  try {
    const migrator = createMigrator(db);
    const { error, results } = down
      ? await migrator.migrateDown()
      : await migrator.migrateToLatest();
    for (const r of results ?? []) {
      console.log(`${r.status.padEnd(8)} ${r.direction.padEnd(4)} ${r.migrationName}`);
    }
    if (error) throw error;
    if (!results?.length) console.log("Nothing to migrate.");
  } finally {
    await db.destroy();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

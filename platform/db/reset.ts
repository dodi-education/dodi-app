/**
 * DEV ONLY: drop and rebuild the platform database from db/migrations + db/seed.
 *
 *   pnpm db:reset
 *
 * Wipes every row. Refuses to run unless DATABASE_URL_MIGRATOR points at
 * localhost/127.0.0.1 or DB_RESET_ALLOW=1 is set.
 */
import { sql } from "kysely";

import { createMigrator, migratorDb, runSeeds } from "./migrate";

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL_MIGRATOR ?? "";
  const local = /@(localhost|127\.0\.0\.1|postgres)(:|\/)/.test(url);
  if (!local && process.env.DB_RESET_ALLOW !== "1") {
    throw new Error(
      "db:reset refuses to run against a non-local database. Set DB_RESET_ALLOW=1 to override.",
    );
  }
  const db = migratorDb();
  try {
    await sql`drop schema if exists public cascade`.execute(db);
    await sql`drop schema if exists app cascade`.execute(db);
    await sql`create schema public`.execute(db);
    const { error, results } = await createMigrator(db).migrateToLatest();
    for (const r of results ?? []) console.log(`${r.status.padEnd(8)} ${r.migrationName}`);
    if (error) throw error;
    const seeds = await runSeeds(db);
    for (const s of seeds) console.log(`seeded   ${s}`);
  } finally {
    await db.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

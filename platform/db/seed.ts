/**
 * Apply the idempotent SQL files in db/seed (development data such as the
 * DODI-BETA invite code). System rows live in the baseline migration, not here.
 *
 *   pnpm db:seed
 */
import { migratorDb, runSeeds } from "./migrate";

async function main(): Promise<void> {
  const db = migratorDb();
  try {
    const files = await runSeeds(db);
    for (const f of files) console.log(`seeded   ${f}`);
  } finally {
    await db.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Regenerate the Kysely `DB` types from the live schema:
 *
 *   pnpm db:codegen        (needs DATABASE_URL_MIGRATOR; run after every migration)
 *
 * Output: core/types/src/database.generated.ts. Column-level union overrides
 * (CHECK-constraint enums) live in db/codegen-overrides.json.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, "../../core/types/src/database.generated.ts");
const OVERRIDES = readFileSync(path.join(HERE, "codegen-overrides.json"), "utf8");

const url = process.env.DATABASE_URL_MIGRATOR;
if (!url) {
  console.error("DATABASE_URL_MIGRATOR is not set");
  process.exit(1);
}

execFileSync(
  "kysely-codegen",
  [
    "--dialect", "postgres",
    "--url", url,
    "--out-file", OUT,
    "--date-parser", "string",
    "--numeric-parser", "number",
    "--exclude-pattern", "kysely_migration*",
    "--default-schema", "public",
    "--overrides", JSON.stringify(JSON.parse(OVERRIDES)),
  ],
  { stdio: "inherit", cwd: path.resolve(HERE, ".."), shell: false },
);
// Timestamps are ISO strings on the wire (see src/lib/db.ts type parsers).
const generated = readFileSync(OUT, "utf8").replace(
  "export type Timestamp = ColumnType<Date, Date | string, Date | string>;",
  "export type Timestamp = ColumnType<string, Date | string, Date | string>;",
);
writeFileSync(OUT, generated);
console.log(`Wrote ${OUT}`);

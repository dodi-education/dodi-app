import { DatabaseError } from "pg";

/**
 * Postgres error helpers. Services previously matched PostgREST error shapes
 * (`error.code === "23505"`, message substrings for FK misses); `pg` throws a
 * `DatabaseError` carrying the SQLSTATE plus `constraint`/`detail` fields.
 */

export const PG_UNIQUE_VIOLATION = "23505";
export const PG_FOREIGN_KEY_VIOLATION = "23503";

export function isDatabaseError(error: unknown): error is DatabaseError {
  return error instanceof DatabaseError;
}

/** `true` for a unique-constraint violation (optionally on a named constraint). */
export function isUniqueViolation(
  error: unknown,
  constraint?: string,
): boolean {
  if (!isDatabaseError(error) || error.code !== PG_UNIQUE_VIOLATION) return false;
  return constraint === undefined || error.constraint === constraint;
}

/**
 * `true` for a foreign-key violation. Pass a constraint name to match one
 * specific reference (e.g. `game_snapshots_game_id_fkey`), or a column name to
 * match by the violated key's detail text.
 */
export function isForeignKeyViolation(
  error: unknown,
  constraintOrColumn?: string,
): boolean {
  if (!isDatabaseError(error) || error.code !== PG_FOREIGN_KEY_VIOLATION) {
    return false;
  }
  if (constraintOrColumn === undefined) return true;
  if (error.constraint === constraintOrColumn) return true;
  return (error.detail ?? "").includes(`(${constraintOrColumn})`);
}

/** Short, log-safe description of a database error for API responses. */
export function describeDbError(error: unknown): string {
  if (!isDatabaseError(error)) {
    return error instanceof Error ? error.message : "Unknown database error";
  }
  switch (error.code) {
    case PG_UNIQUE_VIOLATION:
      return "A record with the same unique value already exists.";
    case PG_FOREIGN_KEY_VIOLATION:
      return "A referenced record does not exist.";
    default:
      return error.message;
  }
}

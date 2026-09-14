import type { Json } from "@dodi/types/database";

/**
 * Encode a value bound to a `jsonb` column.
 *
 * `pg` passes JS strings to the wire verbatim, so a bare string bound to a
 * jsonb parameter is parsed BY POSTGRES as JSON — which fails for anything that
 * is not itself valid JSON ("invalid input syntax for type json"). Objects and
 * arrays need no help: pg serializes those itself.
 *
 * Only the polymorphic E2EE columns need this. `games.success_criteria` holds a
 * plain object for system games and publication copies, and an opaque `enc:v1:`
 * string scalar for private ones. Columns that only ever hold a single sealed
 * blob are plain `text` (kids.avatar_config, accounts.encrypted_api_keys, …) and
 * must NOT be routed through here.
 */
export function toJsonbValue(value: unknown): Json {
  return (typeof value === "string" ? JSON.stringify(value) : value) as Json;
}

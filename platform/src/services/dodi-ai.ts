import type { DodiAIDefaults } from "@dodi/types/ai";

import type { Db } from "@/lib/db";

/**
 * Read the dodi AI per-category model recommendations from platform_config
 * (row key `dodi_ai_defaults`, seeded by migration). platform_config is
 * default-deny, so callers pass `serviceDb`; the value holds no secrets
 * and is served verbatim to authed parents via GET /api/ai/defaults.
 *
 * Null ⇒ unseeded/malformed row: the client treats dodi AI defaults as
 * unavailable and cannot resolve the "default" model sentinel.
 */
export async function getDodiAIDefaults(
  db: Db,
): Promise<DodiAIDefaults | null> {
  const row = await db
    .selectFrom("platform_config")
    .select("value")
    .where("key", "=", "dodi_ai_defaults")
    .executeTakeFirst();

  const value = (row?.value ?? null) as unknown as DodiAIDefaults | null;
  if (
    !value ||
    typeof value !== "object" ||
    !value.voice?.provider ||
    !value.thinking?.provider ||
    !value.game?.provider ||
    !value.image?.provider
  ) {
    return null;
  }
  return value;
}

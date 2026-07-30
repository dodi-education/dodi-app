import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@dodi/types/database";
import type { DodiAIDefaults } from "@dodi/types/ai";

type Client = SupabaseClient<Database>;

/**
 * Read the dodi AI per-category model recommendations from platform_config
 * (row key `dodi_ai_defaults`, seeded by migration). platform_config is
 * default-deny, so callers pass `serviceClient()`; the value holds no secrets
 * and is served verbatim to authed parents via GET /api/ai/defaults.
 *
 * Null ⇒ unseeded/malformed row: the client treats dodi AI defaults as
 * unavailable and cannot resolve the "default" model sentinel.
 */
export async function getDodiAIDefaults(
  supabase: Client,
): Promise<DodiAIDefaults | null> {
  const { data, error } = await supabase
    .from("platform_config")
    .select("value")
    .eq("key", "dodi_ai_defaults")
    .maybeSingle();

  if (error) throw error;

  const value = (data?.value ?? null) as unknown as DodiAIDefaults | null;
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

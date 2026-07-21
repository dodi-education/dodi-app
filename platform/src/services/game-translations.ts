import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Game, GameTranslation } from "@dodi/types/database";

/**
 * Per-locale title/description overrides for the SEEDED SYSTEM games, which are
 * plaintext by design. Custom games are generated directly in the kid's language
 * and their title/description are E2EE, so they never get translation rows —
 * `applyTranslation` is a no-op for them. Anything that starts writing rows here
 * must keep that boundary: a translation row is plaintext, so it may only ever
 * exist for a game whose own fields are plaintext too (system or published).
 */
type Client = SupabaseClient<Database>;

export async function getTranslation(
  supabase: Client,
  gameId: string,
  locale: string,
): Promise<GameTranslation | null> {
  const { data, error } = await supabase
    .from("game_translations")
    .select("*")
    .eq("game_id", gameId)
    .eq("locale", locale)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }

  return data as unknown as GameTranslation;
}

export async function getTranslationsForGames(
  supabase: Client,
  gameIds: string[],
  locale: string,
): Promise<Map<string, GameTranslation>> {
  if (gameIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("game_translations")
    .select("*")
    .in("game_id", gameIds)
    .eq("locale", locale);

  if (error) throw error;

  const map = new Map<string, GameTranslation>();
  for (const row of (data ?? []) as unknown as GameTranslation[]) {
    map.set(row.game_id, row);
  }
  return map;
}

export function applyTranslation(
  game: Game,
  translation?: GameTranslation | null,
): Game {
  if (!translation) return game;
  return {
    ...game,
    title: translation.title,
    description: translation.description || game.description,
  };
}

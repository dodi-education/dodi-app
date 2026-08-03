import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Game, GameTranslation } from "@dodi/types/database";

/**
 * Per-locale title/description overrides for PLAINTEXT games: the seeded
 * system games, and parent PUBLICATION copies (written at submit from the
 * publish flow's translations, extended by the locale backfill). Private
 * games' title/description are E2EE and never get rows — `applyTranslation`
 * is a no-op for them. The boundary every writer must keep: a translation row
 * is plaintext, so it may only ever exist for a game whose own fields are
 * plaintext too (system or published).
 */
type Client = SupabaseClient<Database>;

/**
 * Replace a game's translation rows with exactly `entries` — the
 * resubmit-safe write the publish gate uses. Delete-then-insert on purpose:
 * stale locales vanish with the delete, and the write is service-role with a
 * single writer per game, so the tiny non-atomic window is harmless.
 */
export async function upsertTranslations(
  supabase: Client,
  gameId: string,
  entries: Array<{ locale: string; title: string; description: string }>,
): Promise<void> {
  const { error: clearError } = await supabase
    .from("game_translations")
    .delete()
    .eq("game_id", gameId);
  if (clearError) throw clearError;

  const { error } = await supabase.from("game_translations").insert(
    entries.map((entry) => ({
      game_id: gameId,
      locale: entry.locale,
      title: entry.title,
      description: entry.description,
    })),
  );
  if (error) throw error;
}

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

/** All locales' rows for one game (review prompt, backfill bookkeeping). */
export async function listTranslations(
  supabase: Client,
  gameId: string,
): Promise<GameTranslation[]> {
  const { data, error } = await supabase
    .from("game_translations")
    .select("*")
    .eq("game_id", gameId)
    .order("locale");
  if (error) throw error;
  return (data ?? []) as unknown as GameTranslation[];
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

export function applyTranslation<
  T extends Pick<Game, "title" | "description">,
>(game: T, translation?: GameTranslation | null): T {
  if (!translation) return game;
  return {
    ...game,
    title: translation.title,
    description: translation.description || game.description,
  };
}

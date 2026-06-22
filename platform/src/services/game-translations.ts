import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Game, GameTranslation } from "@dodi/types/database";

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

export async function upsertTranslation(
  supabase: Client,
  gameId: string,
  locale: string,
  fields: { title: string; description: string },
): Promise<GameTranslation> {
  const { data, error } = await supabase
    .from("game_translations")
    .upsert(
      {
        game_id: gameId,
        locale,
        title: fields.title,
        description: fields.description,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "game_id,locale" },
    )
    .select("*")
    .single();

  if (error) throw error;
  return data as unknown as GameTranslation;
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

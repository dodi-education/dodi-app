import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  Database,
  Game,
  GameInsert,
  GameUpdate,
} from "@/types/database";
import type { GameMetadata } from "@/types/games";
import { sanitizeGameBundle } from "@/lib/game-sanitizer";

type Client = SupabaseClient<Database>;

export interface ListGamesOptions {
  profileId?: string;
  includeSystem?: boolean;
  search?: string;
  subject?: string;
  tags?: string[];
}

export interface CreateCustomGameInput {
  accountId: string;
  profileId: string;
  sourceGameId?: string | null;
  title: string;
  description?: string;
  subject?: string;
  difficulty?: string;
  targetAgeMin?: number;
  targetAgeMax?: number;
  estimatedDurationMinutes?: number;
  tags?: string[];
  codeBundle: string;
  markdown?: string;
  metadata?: GameMetadata;
  createdBy?: "system" | "ai" | "kid";
}

function castGame(row: unknown): Game {
  return row as Game;
}

export function getGameMetadata(game: Pick<Game, "metadata">): GameMetadata {
  const metadata = game.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }
  return metadata as GameMetadata;
}

export interface GameCatalogEntry {
  id: string;
  title: string;
  subject: string;
  description: string;
  tags: string[];
}

export async function listGameCatalog(
  supabase: Client,
  profileId?: string,
): Promise<GameCatalogEntry[]> {
  let query = supabase
    .from("games")
    .select("id, title, subject, description, tags")
    .order("title", { ascending: true });

  if (profileId) {
    query = query.or(`is_system.eq.true,profile_id.eq.${profileId}`);
  } else {
    query = query.eq("is_system", true);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []) as unknown as GameCatalogEntry[];
}

export async function listGames(
  supabase: Client,
  options: ListGamesOptions,
): Promise<Game[]> {
  const {
    profileId,
    includeSystem = true,
    search,
    subject,
    tags,
  } = options;

  let query = supabase
    .from("games")
    .select("*")
    .order("is_system", { ascending: false })
    .order("created_at", { ascending: false });

  if (profileId) {
    if (includeSystem) {
      query = query.or(`is_system.eq.true,profile_id.eq.${profileId}`);
    } else {
      query = query.eq("profile_id", profileId);
    }
  } else {
    query = query.eq("is_system", true);
  }

  const { data, error } = await query;
  if (error) throw error;

  const base = (data ?? []).map(castGame);

  return base.filter((game) => {
    if (subject && game.subject !== subject) return false;

    if (tags && tags.length > 0) {
      const hasTag = tags.some((tag) => game.tags.includes(tag));
      if (!hasTag) return false;
    }

    if (search) {
      const needle = search.toLowerCase();
      const haystack = `${game.title} ${game.description}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }

    return true;
  });
}

export async function getGame(
  supabase: Client,
  gameId: string,
): Promise<Game | null> {
  const { data, error } = await supabase
    .from("games")
    .select("*")
    .eq("id", gameId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }

  return castGame(data);
}

export async function createCustomGame(
  supabase: Client,
  input: CreateCustomGameInput,
): Promise<Game> {
  const sanitizedBundle = sanitizeGameBundle(input.codeBundle).code;

  const payload: GameInsert = {
    account_id: input.accountId,
    profile_id: input.profileId,
    source_game_id: input.sourceGameId ?? null,
    is_system: false,
    title: input.title,
    description: input.description ?? "",
    subject: input.subject ?? "creativity",
    difficulty: input.difficulty ?? "easy",
    target_age_min: input.targetAgeMin ?? 4,
    target_age_max: input.targetAgeMax ?? 12,
    estimated_duration_minutes: input.estimatedDurationMinutes ?? 10,
    tags: input.tags ?? [],
    code_bundle: sanitizedBundle,
    markdown: input.markdown ?? "",
    metadata: (input.metadata ?? {}) as GameInsert["metadata"],
    created_by: input.createdBy ?? "kid",
  };

  const { data, error } = await supabase
    .from("games")
    .insert(payload)
    .select("*")
    .single();

  if (error) throw error;
  return castGame(data);
}

export async function cloneGameToCustom(
  supabase: Client,
  sourceGameId: string,
  accountId: string,
  profileId: string,
  options?: { title?: string; createdBy?: "ai" | "kid" },
): Promise<Game> {
  const source = await getGame(supabase, sourceGameId);
  if (!source) {
    throw new Error("Source game not found");
  }

  return createCustomGame(supabase, {
    accountId,
    profileId,
    sourceGameId: source.id,
    title: options?.title ?? `${source.title} (Copy)`,
    description: source.description,
    subject: source.subject,
    difficulty: source.difficulty,
    targetAgeMin: source.target_age_min,
    targetAgeMax: source.target_age_max,
    estimatedDurationMinutes: source.estimated_duration_minutes,
    tags: source.tags,
    codeBundle: source.code_bundle,
    markdown: source.markdown,
    metadata: getGameMetadata(source),
    createdBy: options?.createdBy ?? "kid",
  });
}

export async function updateCustomGame(
  supabase: Client,
  gameId: string,
  updates: GameUpdate,
): Promise<Game> {
  const existing = await getGame(supabase, gameId);
  if (!existing) {
    throw new Error("Game not found");
  }

  if (existing.is_system) {
    throw new Error("Cannot update system game directly");
  }

  const nextUpdates: GameUpdate = { ...updates };
  if (nextUpdates.code_bundle) {
    nextUpdates.code_bundle = sanitizeGameBundle(nextUpdates.code_bundle).code;
  }

  const { data, error } = await supabase
    .from("games")
    .update(nextUpdates)
    .eq("id", gameId)
    .select("*")
    .single();

  if (error) throw error;
  return castGame(data);
}

export async function deleteCustomGame(
  supabase: Client,
  gameId: string,
): Promise<void> {
  const existing = await getGame(supabase, gameId);
  if (!existing) {
    throw new Error("Game not found");
  }

  if (existing.is_system) {
    throw new Error("Cannot delete system game");
  }

  const { error } = await supabase
    .from("games")
    .delete()
    .eq("id", gameId);

  if (error) throw error;
}

export async function ensureEditableGame(
  supabase: Client,
  gameId: string,
  accountId: string,
  profileId: string,
  options?: { remixTitle?: string },
): Promise<Game> {
  const game = await getGame(supabase, gameId);
  if (!game) {
    throw new Error("Game not found");
  }

  if (!game.is_system) {
    return game;
  }

  return cloneGameToCustom(supabase, gameId, accountId, profileId, {
    title: options?.remixTitle ?? `${game.title} (Remix)`,
    createdBy: "kid",
  });
}

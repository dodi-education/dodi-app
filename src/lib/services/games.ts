import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  Database,
  Game,
  GameInsert,
  GameSharingInsert,
  GameUpdate,
  Json,
} from "@/types/database";
import type { GameMetadata, GameSharingState } from "@/types/games";
import type { ProgressKind, SuccessCriteria } from "@/lib/games/success";
import { sanitizeGameBundle } from "@/lib/game-sanitizer";

type Client = SupabaseClient<Database>;

export interface ListGamesOptions {
  profileId?: string;
  includeSystem?: boolean;
  search?: string;
  tags?: string[];
}

export interface CreateCustomGameInput {
  accountId: string;
  /** Owning kid profile — set ONLY when a kid created the game; null otherwise. */
  profileId?: string | null;
  sourceGameId?: string | null;
  title: string;
  description?: string;
  targetAgeMin?: number;
  targetAgeMax?: number;
  estimatedDurationMinutes?: number;
  tags?: string[];
  codeBundle: string;
  markdown?: string;
  metadata?: GameMetadata;
  createdBy?: "system" | "parent" | "kid";
  /** Whether the game is playable by kids. Parent-created games start inactive. */
  isActive?: boolean;
  learningGoal?: string;
  successDefinition?: string;
  successCriteria?: SuccessCriteria;
  progressKind?: ProgressKind;
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

/** Per-game sharing state keyed by game id, used to resolve kid visibility. */
export type SharingMap = Map<string, { family: boolean; profileIds: Set<string> }>;

/**
 * Whether a game is visible to a given kid profile. System games are always
 * visible; custom games must be active AND either owned by the profile or
 * shared with it (family-wide or specifically). Inactive custom games are
 * hidden from kids regardless of sharing — they live only in the parent studio.
 */
export function isVisibleToProfile(
  game: Pick<Game, "id" | "is_system" | "is_active" | "profile_id">,
  profileId: string,
  sharings: SharingMap,
): boolean {
  if (game.is_system) return true;
  if (!game.is_active) return false;
  if (game.profile_id === profileId) return true;
  const share = sharings.get(game.id);
  return !!share && (share.family || share.profileIds.has(profileId));
}

/** Fetch all sharing rows for the current account and index them by game id. */
async function loadSharingMap(supabase: Client): Promise<SharingMap> {
  const { data, error } = await supabase
    .from("game_sharings")
    .select("game_id, profile_id");
  if (error) throw error;

  const map: SharingMap = new Map();
  for (const row of data ?? []) {
    let entry = map.get(row.game_id);
    if (!entry) {
      entry = { family: false, profileIds: new Set<string>() };
      map.set(row.game_id, entry);
    }
    if (row.profile_id === null) {
      entry.family = true;
    } else {
      entry.profileIds.add(row.profile_id);
    }
  }
  return map;
}

export interface GameCatalogEntry {
  id: string;
  title: string;
  description: string;
  tags: string[];
}

export async function listGameCatalog(
  supabase: Client,
  profileId?: string,
): Promise<GameCatalogEntry[]> {
  let query = supabase
    .from("games")
    .select("id, title, description, tags")
    .order("title", { ascending: true });

  if (profileId) {
    // System games, or active games owned by this profile. Inactive owned
    // games stay out of the kid-facing catalog.
    query = query.or(
      `is_system.eq.true,and(profile_id.eq.${profileId},is_active.eq.true)`,
    );
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
    tags,
  } = options;

  let query = supabase
    .from("games")
    .select("*")
    .order("is_system", { ascending: false })
    .order("created_at", { ascending: false });

  if (profileId) {
    // RLS already limits custom rows to this account; fetch account + system
    // games and apply audience visibility (owner / shared / family) in JS so
    // games shared with this kid by another profile are included.
    if (!includeSystem) {
      query = query.eq("is_system", false);
    }
  } else {
    query = query.eq("is_system", true);
  }

  const { data, error } = await query;
  if (error) throw error;

  const base = (data ?? []).map(castGame);

  // Sharing rows are only needed when filtering for a specific kid profile.
  const sharings: SharingMap = profileId
    ? await loadSharingMap(supabase)
    : new Map();

  return base.filter((game) => {
    if (profileId && !isVisibleToProfile(game, profileId, sharings))
      return false;

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

/** List all custom (non-system) games owned by an account, newest first. */
export async function listAccountGames(
  supabase: Client,
  accountId: string,
): Promise<Game[]> {
  const { data, error } = await supabase
    .from("games")
    .select("*")
    .eq("account_id", accountId)
    .eq("is_system", false)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(castGame);
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
    profile_id: input.profileId ?? null,
    source_game_id: input.sourceGameId ?? null,
    is_system: false,
    is_active: input.isActive ?? false,
    title: input.title,
    description: input.description ?? "",
    target_age_min: input.targetAgeMin ?? 4,
    target_age_max: input.targetAgeMax ?? 12,
    estimated_duration_minutes: input.estimatedDurationMinutes ?? 10,
    tags: input.tags ?? [],
    code_bundle: sanitizedBundle,
    markdown: input.markdown ?? "",
    metadata: (input.metadata ?? {}) as GameInsert["metadata"],
    created_by: input.createdBy ?? "kid",
    learning_goal: input.learningGoal ?? "",
    success_definition: input.successDefinition ?? "",
    success_criteria: (input.successCriteria ?? {}) as unknown as Json,
    progress_kind: input.progressKind ?? "open",
  };

  const { data, error } = await supabase
    .from("games")
    .insert(payload)
    .select("*")
    .single();

  if (error) throw error;
  return castGame(data);
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

/**
 * Replace all sharing rows for a game with the given target. `family: true`
 * writes a single account-wide row (profile_id NULL); otherwise one row per
 * profile id. An empty, non-family target leaves the game shared with nobody.
 */
export async function replaceGameSharings(
  supabase: Client,
  gameId: string,
  accountId: string,
  sharing: GameSharingState,
): Promise<void> {
  const { error: deleteError } = await supabase
    .from("game_sharings")
    .delete()
    .eq("game_id", gameId);
  if (deleteError) throw deleteError;

  const rows: GameSharingInsert[] = sharing.family
    ? [{ game_id: gameId, account_id: accountId, profile_id: null }]
    : sharing.profileIds.map((profileId) => ({
        game_id: gameId,
        account_id: accountId,
        profile_id: profileId,
      }));

  if (rows.length === 0) return;

  const { error: insertError } = await supabase
    .from("game_sharings")
    .insert(rows);
  if (insertError) throw insertError;
}

/** Read the normalized sharing state for a single game (for the studio UI). */
export async function getGameSharing(
  supabase: Client,
  gameId: string,
): Promise<GameSharingState> {
  const { data, error } = await supabase
    .from("game_sharings")
    .select("profile_id")
    .eq("game_id", gameId);
  if (error) throw error;

  const profileIds: string[] = [];
  let family = false;
  for (const row of data ?? []) {
    if (row.profile_id === null) family = true;
    else profileIds.push(row.profile_id);
  }
  return { family, profileIds };
}

/** Single-game visibility check (kid deep-link / play gate). */
export async function isGameVisibleToProfile(
  supabase: Client,
  game: Pick<Game, "id" | "is_system" | "is_active" | "profile_id">,
  profileId: string,
): Promise<boolean> {
  if (game.is_system) return true;
  if (!game.is_active) return false;
  if (game.profile_id === profileId) return true;

  const { data, error } = await supabase
    .from("game_sharings")
    .select("profile_id")
    .eq("game_id", game.id);
  if (error) throw error;

  return (data ?? []).some(
    (row) => row.profile_id === null || row.profile_id === profileId,
  );
}

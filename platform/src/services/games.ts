/**
 * Games persistence.
 *
 * The eight content fields (title, description, code_bundle, markdown,
 * learning_goal, success_definition, success_criteria, preview_image) arrive
 * here already SEALED for private games — the browser encrypts them under the
 * account VMK before the request leaves it, so nothing in this file may inspect,
 * compare or transform them. In particular the bundle is sanitized client-side
 * (@dodi/games/sanitizer) rather than here; the one place the server can and does
 * sanitize is the publication path, where the submitted copy is plaintext by
 * design (see ./game-publications).
 *
 * Plaintext, and therefore still queryable here: ids, FKs, tags, ages, duration,
 * progress_kind, metadata, flags and timestamps.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  Database,
  Game,
  GameInsert,
  GameSharingInsert,
  GameUpdate,
  GameVersion,
  Json,
} from "@dodi/types/database";
import type { GameMetadata, GameSharingState } from "@dodi/types/games";
import type { ProgressKind, SuccessCriteria } from "@dodi/types/success";
import { GAME_TAG_IDS } from "@dodi/games/tags";

type Client = SupabaseClient<Database>;

const CATALOG_TAGS = new Set<string>(GAME_TAG_IDS);

/**
 * Keep only tags in the game-studio catalog ({@link GAME_TAGS}); drop stray or
 * legacy tags (normalized to lowercase, de-duplicated). This is the write-side
 * guarantee that games never store non-catalog tags.
 */
export function filterToCatalogTags(tags: string[] | undefined | null): string[] {
  if (!tags) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim().toLowerCase();
    if (CATALOG_TAGS.has(tag) && !seen.has(tag)) {
      seen.add(tag);
      out.push(tag);
    }
  }
  return out;
}

export interface ListGamesOptions {
  kidId?: string;
  includeSystem?: boolean;
  tags?: string[];
}

export interface CreateCustomGameInput {
  accountId: string;
  /** Owning kid — set ONLY when a kid created the game; null otherwise. */
  kidId?: string | null;
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
  /** enc:v1: sealed studio conversation transcript (server-blind). */
  agentTranscriptEnc?: string | null;
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
export type SharingMap = Map<string, { family: boolean; kidIds: Set<string> }>;

/**
 * Whether a game is visible to a given kid. System games are always
 * visible; custom games must be active AND either owned by the kid or
 * shared with it (family-wide or specifically). Inactive custom games are
 * hidden from kids regardless of sharing — they live only in the parent studio.
 */
export function isVisibleToKid(
  game: Pick<Game, "id" | "is_system" | "is_active" | "kid_id">,
  kidId: string,
  sharings: SharingMap,
): boolean {
  if (game.is_system) return true;
  if (!game.is_active) return false;
  if (game.kid_id === kidId) return true;
  const share = sharings.get(game.id);
  return !!share && (share.family || share.kidIds.has(kidId));
}

/** Fetch all sharing rows for the current account and index them by game id. */
async function loadSharingMap(supabase: Client): Promise<SharingMap> {
  const { data, error } = await supabase
    .from("game_sharings")
    .select("game_id, kid_id");
  if (error) throw error;

  const map: SharingMap = new Map();
  for (const row of data ?? []) {
    let entry = map.get(row.game_id);
    if (!entry) {
      entry = { family: false, kidIds: new Set<string>() };
      map.set(row.game_id, entry);
    }
    if (row.kid_id === null) {
      entry.family = true;
    } else {
      entry.kidIds.add(row.kid_id);
    }
  }
  return map;
}

export async function listGames(
  supabase: Client,
  options: ListGamesOptions,
): Promise<Game[]> {
  const { kidId, includeSystem = true, tags } = options;

  let query = supabase
    .from("games")
    .select("*")
    // Publication copies are catalog submissions, not library entries.
    .is("publication_requested_at", null)
    .order("is_system", { ascending: false })
    .order("created_at", { ascending: false });

  if (kidId) {
    // RLS already limits custom rows to this account; fetch account + system
    // games and apply audience visibility (owner / shared / family) in JS so
    // games shared with this kid by another kid are included.
    if (!includeSystem) {
      query = query.eq("is_system", false);
    }
  } else {
    query = query.eq("is_system", true);
  }

  const { data, error } = await query;
  if (error) throw error;

  const base = (data ?? []).map(castGame);

  // Sharing rows are only needed when filtering for a specific kid.
  const sharings: SharingMap = kidId
    ? await loadSharingMap(supabase)
    : new Map();

  return base.filter((game) => {
    if (kidId && !isVisibleToKid(game, kidId, sharings))
      return false;

    if (tags && tags.length > 0) {
      const hasTag = tags.some((tag) => game.tags.includes(tag));
      if (!hasTag) return false;
    }

    return true;
  });
}

/**
 * List all custom (non-system) games owned by an account, newest first.
 * Publication copies are excluded — they are submissions to the public catalog,
 * managed from their source game's studio page, not separate studio entries.
 */
export async function listAccountGames(
  supabase: Client,
  accountId: string,
): Promise<Game[]> {
  const { data, error } = await supabase
    .from("games")
    .select("*")
    .eq("account_id", accountId)
    .eq("is_system", false)
    .is("publication_requested_at", null)
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
  const payload: GameInsert = {
    account_id: input.accountId,
    kid_id: input.kidId ?? null,
    source_game_id: input.sourceGameId ?? null,
    is_system: false,
    is_active: input.isActive ?? false,
    title: input.title,
    description: input.description ?? "",
    target_age_min: input.targetAgeMin ?? 4,
    target_age_max: input.targetAgeMax ?? 12,
    estimated_duration_minutes: input.estimatedDurationMinutes ?? 10,
    tags: filterToCatalogTags(input.tags),
    code_bundle: input.codeBundle,
    markdown: input.markdown ?? "",
    metadata: (input.metadata ?? {}) as GameInsert["metadata"],
    created_by: input.createdBy ?? "kid",
    learning_goal: input.learningGoal ?? "",
    success_definition: input.successDefinition ?? "",
    success_criteria: (input.successCriteria ?? {}) as unknown as Json,
    progress_kind: input.progressKind ?? "open",
    agent_transcript_enc: input.agentTranscriptEnc ?? null,
  };

  const { data, error } = await supabase
    .from("games")
    .insert(payload)
    .select("*")
    .single();

  if (error) throw error;
  const game = castGame(data);

  // Every custom game starts its version history at creation (agent build,
  // import, kid voice-create all land here).
  const version = await insertGameVersion(supabase, game, game.code_bundle, null);
  return await setCurrentVersion(supabase, game.id, version.id);
}

/** Append a version row for a game. `previousId` = the chain link (null for the first). */
async function insertGameVersion(
  supabase: Client,
  game: Pick<Game, "id" | "account_id">,
  codeBundle: string,
  previousId: string | null,
): Promise<GameVersion> {
  if (!game.account_id) {
    throw new Error("Cannot version a game without an owning account");
  }
  const { data, error } = await supabase
    .from("game_versions")
    .insert({
      game_id: game.id,
      account_id: game.account_id,
      code_bundle: codeBundle,
      previous_game_version_id: previousId,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as GameVersion;
}

async function setCurrentVersion(
  supabase: Client,
  gameId: string,
  versionId: string,
): Promise<Game> {
  const { data, error } = await supabase
    .from("games")
    .update({ current_game_version_id: versionId })
    .eq("id", gameId)
    .select("*")
    .single();
  if (error) throw error;
  return castGame(data);
}

export interface UpdateCustomGameOptions {
  /**
   * When the update changes code_bundle: append a game_versions row (default).
   * `false` (manual editor save with "new version" declined) updates the
   * current head version's code in place instead, so the chain stays truthful
   * without growing.
   */
  createVersion?: boolean;
}

export async function updateCustomGame(
  supabase: Client,
  gameId: string,
  updates: GameUpdate,
  options: UpdateCustomGameOptions = {},
): Promise<Game> {
  const existing = await getGame(supabase, gameId);
  if (!existing) {
    throw new Error("Game not found");
  }

  if (existing.is_system) {
    throw new Error("Cannot update system game directly");
  }

  const nextUpdates: GameUpdate = { ...updates };
  if (nextUpdates.tags) {
    nextUpdates.tags = filterToCatalogTags(nextUpdates.tags);
  }

  // Sending `code_bundle` at all IS the change signal: the studio only includes
  // it after a real build or a manual editor save. Comparing values would be
  // meaningless anyway — resealing the same code yields different ciphertext
  // every time (fresh nonce), so a value compare would append a version row on
  // every save.
  const codeChanged = Boolean(nextUpdates.code_bundle);
  if (codeChanged) {
    const newCode = nextUpdates.code_bundle as string;
    if (options.createVersion === false && existing.current_game_version_id) {
      // Overwrite the head version so it keeps matching the game's code.
      const { error } = await supabase
        .from("game_versions")
        .update({ code_bundle: newCode })
        .eq("id", existing.current_game_version_id);
      if (error) throw error;
    } else {
      const version = await insertGameVersion(
        supabase,
        existing,
        newCode,
        existing.current_game_version_id,
      );
      nextUpdates.current_game_version_id = version.id;
    }
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

/** Lean version-history entry — everything but the code blob. */
export interface GameVersionSummary {
  id: string;
  previous_game_version_id: string | null;
  created_at: string;
}

/** A game's version history, newest first (no code payloads). */
export async function listGameVersions(
  supabase: Client,
  gameId: string,
): Promise<GameVersionSummary[]> {
  const { data, error } = await supabase
    .from("game_versions")
    .select("id, previous_game_version_id, created_at")
    .eq("game_id", gameId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as GameVersionSummary[];
}

/** A single version row incl. its code. Returns null if it doesn't belong to the game. */
export async function getGameVersion(
  supabase: Client,
  gameId: string,
  versionId: string,
): Promise<GameVersion | null> {
  const { data, error } = await supabase
    .from("game_versions")
    .select("*")
    .eq("id", versionId)
    .eq("game_id", gameId)
    .maybeSingle();
  if (error) throw error;
  return (data as GameVersion | null) ?? null;
}

/**
 * Switch a game to an existing version: copy that version's code into
 * games.code_bundle and point current_game_version_id at it. No new version
 * row is created — the head just moves (revert = restore the head's previous).
 */
export async function restoreGameVersion(
  supabase: Client,
  gameId: string,
  versionId: string,
): Promise<Game> {
  const existing = await getGame(supabase, gameId);
  if (!existing) {
    throw new Error("Game not found");
  }
  if (existing.is_system) {
    throw new Error("Cannot update system game directly");
  }

  const version = await getGameVersion(supabase, gameId, versionId);
  if (!version) {
    throw new Error("Version not found");
  }

  const { data, error } = await supabase
    .from("games")
    .update({
      code_bundle: version.code_bundle,
      current_game_version_id: version.id,
    })
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

  // Withdraw any pending/live publication first. The FK is ON DELETE SET NULL,
  // so leaving it would orphan a plaintext public copy with no way back to its
  // owner — and deleting the original is a clear signal to unpublish.
  const { error: publicationError } = await supabase
    .from("games")
    .delete()
    .eq("source_game_id", gameId)
    .not("publication_requested_at", "is", null);
  if (publicationError) throw publicationError;

  // Autosave slots die with their game (manual snapshots are self-contained
  // and survive via the FK's ON DELETE SET NULL; an autosave without its game
  // could never be restored).
  const { error: autosaveError } = await supabase
    .from("game_snapshots")
    .delete()
    .eq("game_id", gameId)
    .eq("origin", "autosave");
  if (autosaveError) throw autosaveError;

  const { error } = await supabase
    .from("games")
    .delete()
    .eq("id", gameId);

  if (error) throw error;
}

/**
 * Replace all sharing rows for a game with the given target. `family: true`
 * writes a single account-wide row (kid_id NULL); otherwise one row per
 * kid id. An empty, non-family target leaves the game shared with nobody.
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
    ? [{ game_id: gameId, account_id: accountId, kid_id: null }]
    : sharing.kidIds.map((kidId) => ({
        game_id: gameId,
        account_id: accountId,
        kid_id: kidId,
      }));

  if (rows.length === 0) return;

  const { error: insertError } = await supabase
    .from("game_sharings")
    .insert(rows);
  if (insertError) throw insertError;
}

/**
 * Read the normalized sharing state for every game in an account, keyed by game
 * id (for the parent studio list). Games with no sharing rows are absent from
 * the map — the caller defaults them to "shared with nobody".
 */
export async function getAccountSharingByGame(
  supabase: Client,
  accountId: string,
): Promise<Record<string, GameSharingState>> {
  const { data, error } = await supabase
    .from("game_sharings")
    .select("game_id, kid_id")
    .eq("account_id", accountId);
  if (error) throw error;

  const map: Record<string, GameSharingState> = {};
  for (const row of data ?? []) {
    let entry = map[row.game_id];
    if (!entry) {
      entry = { family: false, kidIds: [] };
      map[row.game_id] = entry;
    }
    if (row.kid_id === null) entry.family = true;
    else entry.kidIds.push(row.kid_id);
  }
  return map;
}

/** Read the normalized sharing state for a single game (for the studio UI). */
export async function getGameSharing(
  supabase: Client,
  gameId: string,
): Promise<GameSharingState> {
  const { data, error } = await supabase
    .from("game_sharings")
    .select("kid_id")
    .eq("game_id", gameId);
  if (error) throw error;

  const kidIds: string[] = [];
  let family = false;
  for (const row of data ?? []) {
    if (row.kid_id === null) family = true;
    else kidIds.push(row.kid_id);
  }
  return { family, kidIds };
}

/** Single-game visibility check (kid deep-link / play gate). */
export async function isGameVisibleToKid(
  supabase: Client,
  game: Pick<Game, "id" | "is_system" | "is_active" | "kid_id">,
  kidId: string,
): Promise<boolean> {
  if (game.is_system) return true;
  if (!game.is_active) return false;
  if (game.kid_id === kidId) return true;

  const { data, error } = await supabase
    .from("game_sharings")
    .select("kid_id")
    .eq("game_id", game.id);
  if (error) throw error;

  return (data ?? []).some(
    (row) => row.kid_id === null || row.kid_id === kidId,
  );
}

/** Game ids the given kid has favorited (RLS scopes to the current account). */
export async function getFavoriteGameIds(
  supabase: Client,
  kidId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("game_favorites")
    .select("game_id")
    .eq("kid_id", kidId);
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.game_id));
}

/** Mark a game as a kid's favorite. Idempotent — a duplicate favorite is a no-op. */
export async function addFavorite(
  supabase: Client,
  input: { accountId: string; kidId: string; gameId: string },
): Promise<void> {
  const { error } = await supabase.from("game_favorites").insert({
    account_id: input.accountId,
    kid_id: input.kidId,
    game_id: input.gameId,
  });
  // 23505 = unique_violation → already favorited; treat as success.
  if (error && error.code !== "23505") throw error;
}

/** Remove a kid's favorite. Idempotent. */
export async function removeFavorite(
  supabase: Client,
  input: { kidId: string; gameId: string },
): Promise<void> {
  const { error } = await supabase
    .from("game_favorites")
    .delete()
    .eq("kid_id", input.kidId)
    .eq("game_id", input.gameId);
  if (error) throw error;
}

/**
 * The parent's games library: the "Your games" rows, delete, and the two copy
 * paths (a private copy of an owned game, and Remix of a published Discover
 * game).
 *
 * Copies are E2EE: the source content is read in plaintext on the device (the
 * decrypted owned row, or the published row which is plaintext by design),
 * re-sealed under THIS account's vault and POSTed as a new, inactive game with
 * `sourceGameId` pointing back. The server never sees the copy unsealed.
 * Clients render the list and dialogs and map failures to copy.
 */
import type { Game, Json, Kid } from "@dodi/types/database";
import type { DiscoverGameDetail, GameSharingState } from "@dodi/types/games";
import { isUnbuiltBundle } from "@dodi/games/placeholder";
import type { GameCreateFields } from "@dodi/vault/game-crypto";

import type { AccountGame, GameCrypto, GameStore } from "./game-store";
import type { PlatformApi } from "./platform";

export interface GameLibraryDeps {
  api: PlatformApi;
  games: GameStore;
  gameCrypto: GameCrypto;
}

/** One "Your games" row, as the studio list renders it. */
export interface GameListItem {
  id: string;
  title: string;
  tags: string[];
  updatedAt: string;
  /** Whether kids can see/play this game (false = parent hasn't activated it). */
  isActive: boolean;
  /** Shared with the whole family. */
  isFamily: boolean;
  /** Decrypted names of the specific kids this game is shared with. */
  kidNames: string[];
  /** Current sharing state: seeds the "Share with kids" dialog. */
  sharing: GameSharingState;
  /** Real code has been written (not the unbuilt placeholder): publishable. */
  built: boolean;
  /** Still on the studio's Plan step (games.plan_enc set): no settings saved yet. */
  isPlanning: boolean;
  /** Decrypted 100×100 list preview; null falls back to the tag tile. */
  previewImage: string | null;
  /** Times this game has been played (this row's game_plays). */
  plays: number;
  /** Private remixes pointing back at this game via source_game_id. */
  copies: number;
}

/**
 * The studio list rows from the DECRYPTED account games and kids. A planning
 * draft has no name until its settings are saved, so it shows `untitledTitle`.
 * The owning kid (for kid-created games) always counts as audience.
 */
export function buildGameListItems(
  games: AccountGame[] | null,
  kids: Pick<Kid, "id" | "display_name">[] | null,
  untitledTitle: string,
): GameListItem[] {
  if (!games) return [];
  const nameById = new Map((kids ?? []).map((k) => [k.id, k.display_name]));
  return games.map((g) => {
    const share = g.sharing ?? { family: false, kidIds: [] };
    const audienceIds = new Set(share.kidIds);
    if (g.kid_id) audienceIds.add(g.kid_id);
    const kidNames = Array.from(audienceIds)
      .map((id) => nameById.get(id))
      .filter((name): name is string => Boolean(name));
    return {
      id: g.id,
      title: g.title || untitledTitle,
      tags: g.tags,
      updatedAt: g.updated_at,
      isActive: g.is_active,
      isFamily: share.family,
      kidNames,
      sharing: share,
      // Readable only because the store decrypted the bundle.
      built: !isUnbuiltBundle(g.code_bundle),
      isPlanning: g.plan_enc != null,
      previewImage: g.preview_image,
      plays: g.plays,
      copies: g.copies,
    };
  });
}

export type EditedAgoKey = "editedToday" | "editedDaysAgo" | "editedWeeksAgo";

/** The `gameStudio` message key (and values) for "edited … ago". */
export function editedAgo(
  iso: string,
  now: number = Date.now(),
): { key: EditedAgoKey; values?: Record<string, number> } {
  const days = Math.floor((now - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return { key: "editedToday" };
  if (days < 7) return { key: "editedDaysAgo", values: { days } };
  return { key: "editedWeeksAgo", values: { weeks: Math.floor(days / 7) } };
}

/** The kid a new copy is created under (the first kid); null without kids. */
export function primaryKidIdOf(kids: Pick<Kid, "id">[] | null): string | null {
  return kids?.[0]?.id ?? null;
}

/**
 * Delete an owned game. The platform cascades to versions, sharings, favorites
 * and autosaves; the whole game cache is dropped so every view refetches (kid
 * libraries hold copies of the row too). Throws with the server's error text,
 * or an empty message when it gave none.
 */
export async function deleteGame(deps: GameLibraryDeps, gameId: string): Promise<void> {
  const res = await deps.api.request(`/api/games/${gameId}`, { method: "DELETE" });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error || "");
  }
  deps.games.getState().invalidate();
}

/** The content a copy carries over (plaintext; sealed by {@link createCopy}). */
type CopySource = Pick<
  Game,
  | "title"
  | "description"
  | "markdown"
  | "code_bundle"
  | "learning_goal"
  | "success_definition"
  | "success_criteria"
  | "preview_image"
  | "tags"
  | "progress_kind"
  | "target_age_min"
  | "target_age_max"
  | "estimated_duration_minutes"
  | "metadata"
>;

/** The create route's plaintext content fields for a copy (pre-seal). */
export function copyCreateFields(source: CopySource): GameCreateFields {
  return {
    title: source.title,
    description: source.description || undefined,
    markdown: source.markdown || undefined,
    codeBundle: source.code_bundle,
    learningGoal: source.learning_goal || undefined,
    successDefinition: source.success_definition || undefined,
    successCriteria:
      source.success_criteria &&
      typeof source.success_criteria === "object" &&
      Object.keys(source.success_criteria).length
        ? (source.success_criteria as Json)
        : undefined,
    previewImage: source.preview_image || undefined,
  };
}

/** Seal the copy under this vault and POST it inactive. Resolves the new id. */
async function createCopy(
  deps: GameLibraryDeps,
  source: CopySource,
  sourceGameId: string,
  kidId: string,
): Promise<string> {
  const sealed = await deps.gameCrypto.sealGameCreateFields(copyCreateFields(source));
  const res = await deps.api.request("/api/games", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kidId,
      sourceGameId,
      ...sealed,
      tags: source.tags,
      progressKind: source.progress_kind,
      targetAgeMin: source.target_age_min,
      targetAgeMax: source.target_age_max,
      estimatedDurationMinutes: source.estimated_duration_minutes,
      metadata: source.metadata ?? {},
      // A copy starts inactive: the parent reviews before kids see it.
      isActive: false,
    }),
  });
  if (!res.ok) throw new Error("Failed to create the copy");
  const created = (await res.json()) as { id: string };
  deps.games.getState().invalidate();
  return created.id;
}

/**
 * A private, editable copy of an owned game: re-read the decrypted row
 * (forced), re-seal it and create it. Resolves the new game's id.
 */
export async function copyOwnedGame(
  deps: GameLibraryDeps,
  gameId: string,
  kidId: string,
): Promise<string> {
  const row = await deps.games.getState().loadOne(gameId, undefined, true);
  if (!row) throw new Error("Game not found");
  return createCopy(deps, row, gameId, kidId);
}

/**
 * Remix a published Discover game: fetch its plaintext detail, re-seal it
 * under this account's vault (preview included) and create a private copy
 * (inactive, no audience). Resolves the new game's id.
 */
export async function remixDiscoverGame(
  deps: GameLibraryDeps,
  gameId: string,
  kidId: string,
  locale: string,
): Promise<string> {
  const res = await deps.api.request(
    `/api/discover/games/${gameId}?locale=${encodeURIComponent(locale)}`,
  );
  if (!res.ok) throw new Error("Failed to load the game");
  const detail = (await res.json()) as DiscoverGameDetail;
  return createCopy(deps, detail, gameId, kidId);
}

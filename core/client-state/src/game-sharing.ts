/**
 * Who can play a game: the audience picker's state and the two sharing
 * backends behind one "Share with kids" UI.
 *
 * - `discover`: play-in-place on a published row via
 *   `PUT /api/discover/games/:id/sharing`. No copy is made; this family's
 *   game_sharings rows point at the single published game, so plays aggregate
 *   there.
 * - `studio`: a private owned game via `PATCH /api/games/:id` with `audience`.
 *   Kids see it through the normal library visibility rules.
 *
 * Clients render the pills and map failures to copy.
 */
import type { DiscoverGameDetail, GameSharingState } from "@dodi/types/games";

import type { GameStore } from "./game-store";
import type { PlatformApi } from "./platform";

/** The audience picker's selection: the whole family, or specific kids. */
export interface AudienceSelection {
  isFamily: boolean;
  audienceIds: string[];
}

export type ShareVariant = "discover" | "studio";

/** Fields a share dialog needs; Discover summaries and studio rows both fit. */
export interface ShareableGame {
  id: string;
  title: string;
  sharing: GameSharingState;
}

export interface GameSharingDeps {
  api: PlatformApi;
  games: GameStore;
}

/** No one: the empty audience. */
export const EMPTY_SHARING: GameSharingState = { family: false, kidIds: [] };

/** "Added": the family shares the game with anyone at all. */
export function isSharingAdded(sharing: GameSharingState): boolean {
  return sharing.family || sharing.kidIds.length > 0;
}

/** Seed the picker from a game's current sharing. */
export function audienceFromSharing(sharing: GameSharingState): AudienceSelection {
  return { isFamily: sharing.family, audienceIds: sharing.kidIds };
}

/** Pick the whole family (clears the per-kid picks). */
export function selectFamilyAudience(): AudienceSelection {
  return { isFamily: true, audienceIds: [] };
}

/** Toggle one kid; picking a kid leaves the "family" choice. */
export function toggleAudienceKid(selection: AudienceSelection, kidId: string): AudienceSelection {
  const ids = selection.audienceIds;
  return {
    isFamily: false,
    audienceIds: ids.includes(kidId) ? ids.filter((id) => id !== kidId) : [...ids, kidId],
  };
}

/** Whether a kid's pill shows as selected. */
export function isAudienceKidSelected(selection: AudienceSelection, kidId: string): boolean {
  return !selection.isFamily && selection.audienceIds.includes(kidId);
}

/**
 * Save a game's audience through the variant's backend and mirror it into the
 * game cache. Resolves the saved sharing state; throws on any failure.
 */
export async function saveGameSharing(
  deps: GameSharingDeps,
  variant: ShareVariant,
  gameId: string,
  selection: AudienceSelection,
): Promise<GameSharingState> {
  const { isFamily, audienceIds } = selection;
  if (variant === "studio") {
    const res = await deps.api.request(`/api/games/${gameId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audience: { isFamily, audienceIds } }),
    });
    if (!res.ok) throw new Error("Failed to save sharing");
    const sharing: GameSharingState = { family: isFamily, kidIds: isFamily ? [] : audienceIds };
    deps.games.getState().patchLocal(gameId, { sharing });
    // Audience changed: kid libraries must refetch on next visit.
    deps.games.setState({ byKid: {} });
    return sharing;
  }
  const res = await deps.api.request(`/api/discover/games/${gameId}/sharing`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isFamily, audienceIds }),
  });
  if (!res.ok) throw new Error("Failed to save sharing");
  const { sharing } = (await res.json()) as { sharing: GameSharingState };
  deps.games.getState().patchDiscoverSharing(gameId, sharing);
  return sharing;
}

/**
 * Clear this family's audience for a Discover game (play-in-place unshare:
 * there is no copy to delete). Throws on failure.
 */
export async function unshareDiscoverGame(deps: GameSharingDeps, gameId: string): Promise<void> {
  const res = await deps.api.request(`/api/discover/games/${gameId}/sharing`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isFamily: false, audienceIds: [] }),
  });
  if (!res.ok) throw new Error("Failed to remove sharing");
  deps.games.getState().patchDiscoverSharing(gameId, { family: false, kidIds: [] });
}

export interface DiscoverPreview {
  detail: DiscoverGameDetail;
  /** This family's audience for the game. */
  sharing: GameSharingState;
}

/**
 * The parent preview of a PUBLISHED game: its plaintext detail plus this
 * family's sharing. Null when the game is unknown or unpublished (the detail
 * endpoint is gated on `published_at`). A sharing failure falls back to an
 * empty audience rather than blocking the preview. `locale` localizes the
 * system games (the only translated Discover rows).
 */
export async function loadDiscoverPreview(
  api: PlatformApi,
  gameId: string,
  locale: string,
): Promise<DiscoverPreview | null> {
  const [detailRes, sharingRes] = await Promise.all([
    api.request(`/api/discover/games/${gameId}?locale=${encodeURIComponent(locale)}`),
    api.request(`/api/discover/games/${gameId}/sharing`),
  ]);
  if (!detailRes.ok) return null;
  const detail = (await detailRes.json()) as DiscoverGameDetail;
  const sharing: GameSharingState = sharingRes.ok
    ? ((await sharingRes.json()) as { sharing: GameSharingState }).sharing
    : { family: false, kidIds: [] };
  return { detail, sharing };
}

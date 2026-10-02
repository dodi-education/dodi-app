/**
 * The kid's games library (web: components/games/game-library): the
 * catalog-tag filter pills, the free-text search and the favorites, shared by
 * the web and the app.
 *
 * Titles and descriptions are E2EE; the game store hands them over decrypted,
 * which is what makes the free-text search possible at all: the server cannot
 * search ciphertext.
 */
import { GAME_TAG_IDS } from "@dodi/games/tags";

import type { GameStore, LibraryGame } from "./game-store";
import type { PlatformApi } from "./platform";

/** "All games" (no tag filter). */
export const ALL_TAGS_FILTER = "all";

type FilterableGame = Pick<LibraryGame, "title" | "description" | "tags">;

/** Only catalog tags that are actually in use become filter pills (catalog order). */
export function kidGameTagOptions(games: Pick<LibraryGame, "tags">[]): string[] {
  return GAME_TAG_IDS.filter((tag) => games.some((game) => game.tags.includes(tag)));
}

/** The games matching the tag pill and the (case-insensitive) search text. */
export function filterKidGames<T extends FilterableGame>(
  games: T[],
  search: string,
  tagFilter: string,
): T[] {
  const normalizedSearch = search.trim().toLowerCase();
  return games.filter((game) => {
    if (tagFilter !== ALL_TAGS_FILTER && !game.tags.includes(tagFilter)) return false;
    if (!normalizedSearch) return true;
    const target = `${game.title} ${game.description} ${game.tags.join(" ")}`.toLowerCase();
    return target.includes(normalizedSearch);
  });
}

/** Favorites first (their own section), then the rest. */
export function splitFavoriteGames<T extends Pick<LibraryGame, "is_favorite">>(
  games: T[],
): { favorites: T[]; others: T[] } {
  return {
    favorites: games.filter((game) => game.is_favorite),
    others: games.filter((game) => !game.is_favorite),
  };
}

/** Catalog tags only, normalized, at most three: the chips on a game card. */
export function kidCardTags(tags: string[]): string[] {
  const catalog = new Set<string>(GAME_TAG_IDS);
  return tags
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => catalog.has(tag))
    .slice(0, 3);
}

/**
 * Toggle a favorite with an optimistic flip of the cached row; reverts when
 * the request fails. Never rejects.
 */
export async function toggleFavoriteGame(
  deps: { api: Pick<PlatformApi, "request">; games: GameStore },
  kidId: string,
  gameId: string,
  next: boolean,
): Promise<void> {
  const { patchLocal } = deps.games.getState();
  patchLocal(gameId, { is_favorite: next });
  try {
    const response = await deps.api.request(`/api/games/${gameId}/favorite?kidId=${kidId}`, {
      method: next ? "PUT" : "DELETE",
    });
    if (!response.ok) throw new Error("Failed to update favorite");
  } catch {
    patchLocal(gameId, { is_favorite: !next });
  }
}

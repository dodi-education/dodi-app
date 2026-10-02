import { describe, expect, it, vi } from "vitest";
import { createStore } from "zustand/vanilla";

import type { GameStore, GameStoreState } from "./game-store";
import {
  filterKidGames,
  kidCardTags,
  kidGameTagOptions,
  splitFavoriteGames,
  toggleFavoriteGame,
} from "./kid-game-library";

const games = [
  { id: "a", title: "Counting Stars", description: "Count", tags: ["math"], is_favorite: true },
  { id: "b", title: "Letters", description: "ABC fun", tags: ["reading", "legacy"], is_favorite: false },
];

describe("kid game library", () => {
  it("offers only used catalog tags as filter pills", () => {
    expect(kidGameTagOptions(games)).toEqual(
      expect.arrayContaining(["math", "reading"]),
    );
    expect(kidGameTagOptions(games)).not.toContain("legacy");
  });

  it("filters by tag and search text", () => {
    expect(filterKidGames(games, "", "all")).toHaveLength(2);
    expect(filterKidGames(games, "", "math").map((g) => g.id)).toEqual(["a"]);
    expect(filterKidGames(games, " abc ", "all").map((g) => g.id)).toEqual(["b"]);
    expect(filterKidGames(games, "reading", "all").map((g) => g.id)).toEqual(["b"]);
  });

  it("splits favorites and trims card tags to the catalog", () => {
    const { favorites, others } = splitFavoriteGames(games);
    expect(favorites.map((g) => g.id)).toEqual(["a"]);
    expect(others.map((g) => g.id)).toEqual(["b"]);
    expect(kidCardTags([" Math ", "legacy", "reading"])).toEqual(["math", "reading"]);
  });

  it("flips the favorite optimistically and reverts on failure", async () => {
    const patchLocal = vi.fn();
    const store = createStore(() => ({ patchLocal }) as unknown as GameStoreState) as GameStore;
    const request = vi.fn(async () => ({ ok: false }) as Response);
    await toggleFavoriteGame({ api: { request }, games: store }, "kid-1", "g1", true);
    expect(request).toHaveBeenCalledWith("/api/games/g1/favorite?kidId=kid-1", { method: "PUT" });
    expect(patchLocal.mock.calls).toEqual([
      ["g1", { is_favorite: true }],
      ["g1", { is_favorite: false }],
    ]);
  });
});

/**
 * Client game cache: fetch ciphertext once, decrypt once with the VaultSession,
 * and reuse the plaintext across navigation. Decrypted data lives in memory only
 * (never persisted). Mutations call `invalidate()` to force a refetch.
 *
 * This is the SINGLE decrypt point for games. Every consumer — the kid library,
 * the parent studio, the play page, the voice/text AI context — reads plaintext
 * from here, so nothing downstream has to know that `games.title` and friends
 * arrive as `enc:v1:` records. System games and publication copies are stored
 * plaintext and pass straight through `decryptGame`.
 *
 * Mirrors ./kid-store: same single-flight guards, same `awaitSession()` cold-load
 * handling, same patchLocal/invalidate contract.
 */
import { dodi } from "@/lib/api";
import { create } from "zustand";

import {
  type GameContentFields,
  type GameCreateFields,
  decryptGame,
  decryptGameVersion,
  encryptGameCreateFields,
  encryptGameFields,
} from "@dodi/vault/game-crypto";
import type { Game, GameVersion } from "@dodi/types/database";
import type {
  DiscoverGameSummary,
  GameSharingState,
} from "@dodi/types/games";

import { awaitSession } from "./await-session";

/** A game as delivered to the kid library — carries the per-kid favorite flag. */
export type LibraryGame = Game & { is_favorite: boolean };

/** A game as delivered to the parent studio list — carries its sharing state. */
export type AccountGame = Game & { sharing: GameSharingState };

interface GameStoreState {
  /** Kid library, keyed by kid id (a kid sees system + owned + shared games). */
  byKid: Record<string, LibraryGame[]>;
  /** Parent studio list for the current account. */
  account: AccountGame[] | null;
  /**
   * Single games, keyed by {@link scopeKey} rather than plain id: a system game
   * read for a kid carries that kid's locale (the platform applies
   * `game_translations`), so the parent's unscoped read of the same row is a
   * different value and must not collide with it.
   */
  byId: Record<string, Game>;
  /** dodi Discover catalog page(s), PLAINTEXT by design — no decryption. */
  discover: DiscoverGameSummary[] | null;
  /** Keyset cursor for the next Discover page; null = no more pages. */
  discoverCursor: string | null;
  loadForKid: (kidId: string, force?: boolean) => Promise<LibraryGame[]>;
  loadAccount: (force?: boolean) => Promise<AccountGame[]>;
  loadDiscover: (force?: boolean) => Promise<DiscoverGameSummary[]>;
  /** Fetch and append the next Discover page (no-op when exhausted). */
  loadMoreDiscover: () => Promise<void>;
  /**
   * Adopt a new sharing state for a Discover game and drop the kid libraries
   * (their contents just changed with the audience).
   */
  patchDiscoverSharing: (id: string, sharing: GameSharingState) => void;
  loadOne: (
    id: string,
    kidId?: string,
    force?: boolean,
  ) => Promise<Game | null>;
  /** Adopt an already-DECRYPTED row (e.g. a PATCH response) into the cache. */
  put: (game: Game) => void;
  /**
   * Optimistically merge a patch into every cached copy of a game, no refetch.
   * Accepts the per-view extras (`is_favorite`, `sharing`) too, so a favorite
   * flip or a sharing change updates in place.
   */
  patchLocal: (id: string, patch: GamePatch) => void;
  invalidate: () => void;
}

/** A partial game plus the per-view extras the caches carry alongside a row. */
export type GamePatch = Partial<LibraryGame & AccountGame>;

/** Cache key for a single game: the row plus the audience it was read for. */
function scopeKey(id: string, kidId?: string): string {
  return kidId ? `${id}:${kidId}` : id;
}

// Single-flight guards: concurrent callers (e.g. the library and the voice
// session's catalog both mounting) ride the same fetch+decrypt instead of each
// issuing their own. Cleared once settled so a later load refetches.
const kidInFlight = new Map<string, Promise<LibraryGame[]>>();
let accountInFlight: Promise<AccountGame[]> | null = null;
const oneInFlight = new Map<string, Promise<Game | null>>();
let discoverInFlight: Promise<DiscoverGameSummary[]> | null = null;

interface DiscoverPage {
  games: DiscoverGameSummary[];
  nextCursor: string | null;
}

export const useGameStore = create<GameStoreState>((set, get) => ({
  byKid: {},
  account: null,
  byId: {},
  discover: null,
  discoverCursor: null,

  loadForKid: async (kidId, force = false) => {
    const cached = get().byKid[kidId];
    if (cached && !force) return cached;
    const existing = kidInFlight.get(kidId);
    if (existing && !force) return existing;

    const pending = (async () => {
      const res = await dodi.request(
        `/api/games?kidId=${encodeURIComponent(kidId)}`,
      );
      if (!res.ok) throw new Error("Failed to load games");
      const rows = (await res.json()) as LibraryGame[];
      const session = await awaitSession();
      const decrypted = rows.map((row) => ({
        ...decryptGame(session, row),
        is_favorite: row.is_favorite,
      }));

      set((state) => ({
        byKid: { ...state.byKid, [kidId]: decrypted },
        byId: {
          ...state.byId,
          ...Object.fromEntries(decrypted.map((g) => [g.id, g])),
        },
      }));
      return decrypted;
    })();

    kidInFlight.set(kidId, pending);
    try {
      return await pending;
    } finally {
      kidInFlight.delete(kidId);
    }
  },

  loadAccount: async (force = false) => {
    const cached = get().account;
    if (cached && !force) return cached;
    if (accountInFlight && !force) return accountInFlight;

    accountInFlight = (async () => {
      const res = await dodi.request("/api/games?scope=account");
      if (!res.ok) throw new Error("Failed to load games");
      const rows = (await res.json()) as AccountGame[];
      const session = await awaitSession();
      const decrypted = rows.map((row) => ({
        ...decryptGame(session, row),
        sharing: row.sharing ?? { family: false, kidIds: [] },
      }));

      set((state) => ({
        account: decrypted,
        byId: {
          ...state.byId,
          ...Object.fromEntries(decrypted.map((g) => [g.id, g])),
        },
      }));
      return decrypted;
    })();

    try {
      return await accountInFlight;
    } finally {
      accountInFlight = null;
    }
  },

  /**
   * A single game. `kidId` scopes the read for the kid deep-link: the platform
   * derives the locale from it and 404s inactive/unshared games, so a direct URL
   * can't bypass visibility.
   */
  loadOne: async (id, kidId, force = false) => {
    const key = scopeKey(id, kidId);
    const cached = get().byId[key];
    if (cached && !force) return cached;
    const existing = oneInFlight.get(key);
    if (existing && !force) return existing;

    const pending = (async () => {
      const query = kidId ? `?kidId=${encodeURIComponent(kidId)}` : "";
      const res = await dodi.request(`/api/games/${id}${query}`);
      if (!res.ok) return null;
      const row = (await res.json()) as Game;
      const decrypted = decryptGame(await awaitSession(), row);

      set((state) => ({ byId: { ...state.byId, [key]: decrypted } }));
      return decrypted;
    })();

    oneInFlight.set(key, pending);
    try {
      return await pending;
    } finally {
      oneInFlight.delete(key);
    }
  },

  loadDiscover: async (force = false) => {
    const cached = get().discover;
    if (cached && !force) return cached;
    if (discoverInFlight && !force) return discoverInFlight;

    discoverInFlight = (async () => {
      const res = await dodi.request("/api/discover/games");
      if (!res.ok) throw new Error("Failed to load Discover games");
      const page = (await res.json()) as DiscoverPage;
      set({ discover: page.games, discoverCursor: page.nextCursor });
      return page.games;
    })();

    try {
      return await discoverInFlight;
    } finally {
      discoverInFlight = null;
    }
  },

  loadMoreDiscover: async () => {
    const cursor = get().discoverCursor;
    if (!cursor) return;
    const res = await dodi.request(
      `/api/discover/games?cursor=${encodeURIComponent(cursor)}`,
    );
    if (!res.ok) throw new Error("Failed to load Discover games");
    const page = (await res.json()) as DiscoverPage;
    set((state) => {
      // Keyset pages can overlap when something published mid-scroll; dedupe.
      const seen = new Set((state.discover ?? []).map((g) => g.id));
      return {
        discover: [
          ...(state.discover ?? []),
          ...page.games.filter((g) => !seen.has(g.id)),
        ],
        discoverCursor: page.nextCursor,
      };
    });
  },

  patchDiscoverSharing: (id, sharing) =>
    set((state) => ({
      discover:
        state.discover?.map((g) => (g.id === id ? { ...g, sharing } : g)) ??
        state.discover,
      // The audience changed, so the kid libraries changed — refetch lazily.
      byKid: {},
    })),

  put: (game) => {
    // Seed the unscoped entry (the studio's read) so a first write also
    // populates the cache, then fold the row into every other copy.
    set((state) => ({ byId: { ...state.byId, [game.id]: game } }));
    get().patchLocal(game.id, game);
  },

  // Every cached copy of the row is updated: the unscoped entry, any per-kid
  // scoped entry, the studio list and every kid library.
  patchLocal: (id, patch) =>
    set((state) => ({
      byId: Object.fromEntries(
        Object.entries(state.byId).map(([key, game]) => [
          key,
          game.id === id ? { ...game, ...patch } : game,
        ]),
      ),
      account:
        state.account?.map((g) => (g.id === id ? { ...g, ...patch } : g)) ??
        state.account,
      byKid: Object.fromEntries(
        Object.entries(state.byKid).map(([kidId, games]) => [
          kidId,
          games.map((g) => (g.id === id ? { ...g, ...patch } : g)),
        ]),
      ),
    })),

  invalidate: () =>
    set({
      byKid: {},
      account: null,
      byId: {},
      discover: null,
      discoverCursor: null,
    }),
}));

/**
 * Seal/open helpers for rows that travel outside the store — write payloads and
 * POST/PATCH responses. Kept here so callers never touch a VaultSession directly
 * and every crypto call goes through the same `awaitSession()` cold-load guard.
 */
export async function sealGameFields<T extends GameContentFields>(
  fields: T,
): Promise<T> {
  return encryptGameFields(await awaitSession(), fields);
}

export async function sealGameCreateFields<T extends GameCreateFields>(
  fields: T,
): Promise<T> {
  return encryptGameCreateFields(await awaitSession(), fields);
}

export async function decryptGameResponse(row: Game): Promise<Game> {
  return decryptGame(await awaitSession(), row);
}

export async function decryptVersionResponse(
  row: GameVersion,
): Promise<GameVersion> {
  return decryptGameVersion(await awaitSession(), row);
}

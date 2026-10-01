/**
 * Single reactive source of truth for which kid is active in the kid view.
 *
 * Every consumer (home page, switcher, date formatter) reacts the instant the
 * active kid resolves or changes. Where the choice persists is the client's
 * business (`ActiveKidPersistence`: cookies on the web, so the server resolves
 * the kid's UI locale too).
 *
 * `unlockedKidIds` tracks avatar-PIN puzzles solved this session. It is
 * persisted for the session only (the web keeps it in sessionStorage because
 * offline tab switches are full-document navigations), so a fresh session
 * still re-locks protected profiles. The PIN is a sibling gate, not key
 * material.
 */
import { createStore, type StoreApi } from "zustand/vanilla";

import type { Kid } from "@dodi/types/database";

import type { ActiveKidPersistence } from "./platform";

/**
 * Pick the active kid id: keep the persisted kid while it still exists,
 * otherwise fall back to the first (oldest) profile — the same rule the
 * parent→kid switch uses. Returns null only when the account has no kids.
 */
export function pickActiveKidId(kids: Kid[], persistedId: string | null): string | null {
  if (persistedId && kids.some((k) => k.id === persistedId)) return persistedId;
  return kids[0]?.id ?? null;
}

/**
 * A profile needs its avatar-PIN puzzle solved before dodi initializes, unless
 * it has already been unlocked this session (`unlocked`).
 */
export function computeNeedsPin(
  kid: Kid | null | undefined,
  unlocked: ReadonlySet<string>,
): boolean {
  return !!kid?.avatar_pin && !unlocked.has(kid.id);
}

export interface ActiveKidState {
  activeKidId: string | null;
  /** Kids whose PIN puzzle has been solved this session. */
  unlockedKidIds: Set<string>;
  /**
   * Resolve the active kid from the loaded list: keep the persisted kid if it
   * still exists, else the first (oldest). Persists the choice when it was
   * missing or stale so the server and reloads agree.
   */
  resolve: (kids: Kid[]) => void;
  /** Switch the active kid: persist it and mark it unlocked. */
  setActive: (kid: Kid) => void;
  /** Record that a profile's PIN puzzle was solved this session. */
  markUnlocked: (id: string) => void;
}

export type ActiveKidStore = StoreApi<ActiveKidState>;

export function createActiveKidStore(persistence: ActiveKidPersistence): ActiveKidStore {
  return createStore<ActiveKidState>()((set, get) => ({
    activeKidId: null,
    unlockedKidIds: persistence.readUnlockedKidIds(),

    resolve: (kids) => {
      const persistedId = persistence.readActiveKidId();
      const id = pickActiveKidId(kids, persistedId);
      if (id && id !== persistedId) {
        const kid = kids.find((k) => k.id === id);
        if (kid) persistence.writeActiveKid(kid);
      }
      if (get().activeKidId !== id) set({ activeKidId: id });
    },

    setActive: (kid) => {
      persistence.writeActiveKid(kid);
      set((state) => {
        const unlockedKidIds = state.unlockedKidIds.has(kid.id)
          ? state.unlockedKidIds
          : new Set(state.unlockedKidIds).add(kid.id);
        persistence.writeUnlockedKidIds(unlockedKidIds);
        return { activeKidId: kid.id, unlockedKidIds };
      });
    },

    markUnlocked: (id) =>
      set((state) => {
        if (state.unlockedKidIds.has(id)) return state;
        const unlockedKidIds = new Set(state.unlockedKidIds).add(id);
        persistence.writeUnlockedKidIds(unlockedKidIds);
        return { unlockedKidIds };
      }),
  }));
}

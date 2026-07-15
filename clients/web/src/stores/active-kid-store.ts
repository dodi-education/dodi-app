/**
 * Single reactive source of truth for which kid is active in the kid view.
 *
 * Previously each consumer (home page, switcher, date formatter) read the
 * `dodi-active-kid` cookie independently and only once on mount, so a cold entry
 * from "/" — where the cookie is set asynchronously after the E2EE kid list
 * loads — left the home page stuck on "No kid selected" while the switcher had
 * already resolved a kid. Centralizing resolution here makes every consumer
 * react the instant the active kid resolves or changes.
 *
 * `unlockedKidIds` tracks avatar-PIN puzzles solved this page-load. It lives in
 * memory only (never persisted), so a hard refresh re-locks a protected profile.
 */
import { create } from "zustand";

import {
  pickActiveKidId,
  readActiveKidCookie,
  writeActiveKidCookies,
} from "@/lib/active-kid";
import type { Kid } from "@dodi/types/database";

interface ActiveKidState {
  activeKidId: string | null;
  /** Kids whose PIN puzzle has been solved this page-load. */
  unlockedKidIds: Set<string>;
  /**
   * Resolve the active kid from the loaded list: keep the cookie's kid if it
   * still exists, else the first (oldest). Persists the cookie when it was
   * missing or stale so the server and reloads agree.
   */
  resolve: (kids: Kid[]) => void;
  /** Switch the active kid: persist cookies and mark it unlocked for this load. */
  setActive: (kid: Kid) => void;
  /** Record that a profile's PIN puzzle was solved this page-load. */
  markUnlocked: (id: string) => void;
}

export const useActiveKidStore = create<ActiveKidState>((set, get) => ({
  activeKidId: null,
  unlockedKidIds: new Set(),

  resolve: (kids) => {
    const cookieId = readActiveKidCookie();
    const id = pickActiveKidId(kids, cookieId);
    if (id && id !== cookieId) {
      const kid = kids.find((k) => k.id === id);
      if (kid) writeActiveKidCookies(kid);
    }
    if (get().activeKidId !== id) set({ activeKidId: id });
  },

  setActive: (kid) => {
    writeActiveKidCookies(kid);
    set((state) => {
      const unlockedKidIds = state.unlockedKidIds.has(kid.id)
        ? state.unlockedKidIds
        : new Set(state.unlockedKidIds).add(kid.id);
      return { activeKidId: kid.id, unlockedKidIds };
    });
  },

  markUnlocked: (id) =>
    set((state) =>
      state.unlockedKidIds.has(id)
        ? state
        : { unlockedKidIds: new Set(state.unlockedKidIds).add(id) },
    ),
}));

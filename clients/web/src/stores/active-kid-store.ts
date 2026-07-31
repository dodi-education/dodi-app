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
 * `unlockedKidIds` tracks avatar-PIN puzzles solved this tab session. It is
 * mirrored to sessionStorage (parent-lock precedent) because offline tab
 * switches are FULL-document navigations — the service worker serves cached
 * shells and the connectivity-aware links force `location.assign` — and a
 * memory-only set would re-prompt the puzzle on every offline navigation.
 * sessionStorage dies with the tab/app window, so a fresh session still
 * re-locks protected profiles. The PIN is a sibling gate, not key material.
 */
import { create } from "zustand";

import {
  pickActiveKidId,
  readActiveKidCookie,
  writeActiveKidCookies,
} from "@/lib/active-kid";
import type { Kid } from "@dodi/types/database";

const UNLOCKED_KEY = "dodi-kid-unlocked";

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

/** The persisted unlock set for this tab session (empty under SSR/node). */
export function readPersistedUnlockedKidIds(): Set<string> {
  if (!hasWindow()) return new Set();
  try {
    const raw = window.sessionStorage.getItem(UNLOCKED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === "string")
        : [],
    );
  } catch {
    return new Set();
  }
}

function persistUnlockedKidIds(ids: Set<string>): void {
  if (!hasWindow()) return;
  try {
    window.sessionStorage.setItem(UNLOCKED_KEY, JSON.stringify([...ids]));
  } catch {
    // Private mode / quota — unlocks degrade to per-page-load.
  }
}

interface ActiveKidState {
  activeKidId: string | null;
  /** Kids whose PIN puzzle has been solved this tab session. */
  unlockedKidIds: Set<string>;
  /**
   * Resolve the active kid from the loaded list: keep the cookie's kid if it
   * still exists, else the first (oldest). Persists the cookie when it was
   * missing or stale so the server and reloads agree.
   */
  resolve: (kids: Kid[]) => void;
  /** Switch the active kid: persist cookies and mark it unlocked. */
  setActive: (kid: Kid) => void;
  /** Record that a profile's PIN puzzle was solved this tab session. */
  markUnlocked: (id: string) => void;
}

export const useActiveKidStore = create<ActiveKidState>((set, get) => ({
  activeKidId: null,
  unlockedKidIds: readPersistedUnlockedKidIds(),

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
      persistUnlockedKidIds(unlockedKidIds);
      return { activeKidId: kid.id, unlockedKidIds };
    });
  },

  markUnlocked: (id) =>
    set((state) => {
      if (state.unlockedKidIds.has(id)) return state;
      const unlockedKidIds = new Set(state.unlockedKidIds).add(id);
      persistUnlockedKidIds(unlockedKidIds);
      return { unlockedKidIds };
    }),
}));

/**
 * Client cache of the caller's account row: one `/api/account` fetch shared by
 * every consumer (parent-PIN gate, date prefs, notification prefs, plan badge)
 * instead of a store per field. Sensitive fields stay sealed here (`enc:v1:`
 * blobs) — decryption happens at the consumer, where the VaultSession lives.
 * Mutations PATCH the API themselves and mirror the change via `patchLocal`.
 */
import { create } from "zustand";

import { dodi } from "@/lib/api";
import type { Account } from "@dodi/types/database";

/** Plaintext (opt-out; unset ⇒ on) toggles the server reads to decide whether
 *  to send transactional email. Stored in accounts.notification_preferences. */
export interface NotificationPreferences {
  friend_approval_email?: boolean;
  publication_outcome_email?: boolean;
}

interface AccountState {
  account: Account | null;
  loaded: boolean;
  /** True when the last load failed (network/offline) — the PIN gate fails open. */
  loadFailed: boolean;
  load: (force?: boolean) => Promise<void>;
  /** Optimistic merge after a settings form PATCHes the account. */
  patchLocal: (patch: Partial<Account>) => void;
  /** Drop the cache (sign-out / account switch). */
  reset: () => void;
}

// Single-flight guard: concurrent callers (gate + providers mounting together)
// ride the same fetch instead of each issuing their own.
let inFlight: Promise<void> | null = null;

export const useAccountStore = create<AccountState>((set, get) => ({
  account: null,
  loaded: false,
  loadFailed: false,

  load: async (force = false) => {
    if (get().loaded && !force) return;
    if (inFlight && !force) return inFlight;

    inFlight = (async () => {
      try {
        const res = await dodi.request("/api/account");
        if (!res.ok) {
          // 401 = not signed in yet (the root DateFormatProvider also loads on
          // public pages). Leave the store unloaded so the next load() after
          // auth refetches instead of serving a cached failure to the PIN gate.
          if (res.status === 401) return;
          set({ loaded: true, loadFailed: true });
          return;
        }
        const data = (await res.json()) as { account?: Account | null };
        set({
          account: data.account ?? null,
          loaded: true,
          loadFailed: false,
        });
      } catch {
        set({ loaded: true, loadFailed: true });
      }
    })();

    try {
      await inFlight;
    } finally {
      inFlight = null;
    }
  },

  // No-op before the first load (all mutating forms sit behind a loaded
  // account); the next load carries the server truth regardless.
  patchLocal: (patch) =>
    set((state) => ({
      account: state.account ? { ...state.account, ...patch } : state.account,
    })),

  reset: () => set({ account: null, loaded: false, loadFailed: false }),
}));

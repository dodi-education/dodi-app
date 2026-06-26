/**
 * Account-level date/time preference cache. Fetches the account's stored
 * `date_preferences` once and reuses it across navigation. The timezone stays
 * sealed here (decryption happens in the provider, where the VaultSession is
 * available); only the raw stored shape lives in this store.
 */
import { create } from "zustand";

import { dodi } from "@/lib/api";
import type { StoredDatePreferences } from "@dodi/intl";

interface DatePrefState {
  accountStored: StoredDatePreferences | null;
  loaded: boolean;
  load: (force?: boolean) => Promise<void>;
  /** Optimistic update after the settings form saves. */
  setAccountStored: (stored: StoredDatePreferences) => void;
}

let inFlight: Promise<void> | null = null;

export const useDatePrefStore = create<DatePrefState>((set, get) => ({
  accountStored: null,
  loaded: false,

  load: async (force = false) => {
    if (get().loaded && !force) return;
    if (inFlight && !force) return inFlight;

    inFlight = (async () => {
      try {
        const res = await dodi.request("/api/account");
        if (!res.ok) {
          set({ loaded: true });
          return;
        }
        const data = (await res.json()) as {
          account?: { date_preferences?: StoredDatePreferences | null };
        };
        set({
          accountStored: data.account?.date_preferences ?? null,
          loaded: true,
        });
      } catch {
        set({ loaded: true });
      }
    })();

    try {
      await inFlight;
    } finally {
      inFlight = null;
    }
  },

  setAccountStored: (stored) => set({ accountStored: stored, loaded: true }),
}));

/**
 * Account-level parent-PIN ciphertext cache. Holds the sealed `parent_pin_enc`
 * (`enc:v1:` string, or null when no PIN is set) from the account row. The value
 * stays sealed here — decryption happens in the gate/prompt, where the
 * VaultSession is available. Mirrors `date-pref-store`.
 */
import { create } from "zustand";

import { dodi } from "@/lib/api";

interface ParentPinState {
  pinEnc: string | null;
  loaded: boolean;
  /** True when the last load failed (network/offline) — gate fails open. */
  loadFailed: boolean;
  load: (force?: boolean) => Promise<void>;
  /** Optimistic update after the settings form saves/removes the PIN. */
  setPinEnc: (pinEnc: string | null) => void;
}

let inFlight: Promise<void> | null = null;

export const useParentPinStore = create<ParentPinState>((set, get) => ({
  pinEnc: null,
  loaded: false,
  loadFailed: false,

  load: async (force = false) => {
    if (get().loaded && !force) return;
    if (inFlight && !force) return inFlight;

    inFlight = (async () => {
      try {
        const res = await dodi.request("/api/account");
        if (!res.ok) {
          set({ loaded: true, loadFailed: true });
          return;
        }
        const data = (await res.json()) as {
          account?: { parent_pin_enc?: string | null };
        };
        set({
          pinEnc: data.account?.parent_pin_enc ?? null,
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

  setPinEnc: (pinEnc) => set({ pinEnc, loaded: true, loadFailed: false }),
}));

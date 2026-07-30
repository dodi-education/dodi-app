/**
 * The dodi AI per-category recommendations from platform_config
 * (`GET /api/ai/defaults` on the PLATFORM — non-secret display/config data).
 * This is what the "default" model sentinel in the account's model config
 * resolves against at call time, so improving a platform default upgrades
 * every non-customized account without touching user configs.
 */
import { create } from "zustand";

import { dodi } from "@/lib/api";
import type { DodiAIDefaults } from "@dodi/types/ai";

interface DodiAIDefaultsState {
  defaults: DodiAIDefaults | null;
  loaded: boolean;
  load: (force?: boolean) => Promise<DodiAIDefaults | null>;
  clear: () => void;
}

let inFlight: Promise<DodiAIDefaults | null> | null = null;

export const useDodiAIDefaultsStore = create<DodiAIDefaultsState>((set, get) => ({
  defaults: null,
  loaded: false,

  load: async (force = false) => {
    if (get().loaded && !force) return get().defaults;
    if (inFlight && !force) return inFlight;

    inFlight = (async () => {
      try {
        const res = await dodi.request("/api/ai/defaults");
        const defaults = res.ok ? ((await res.json()) as DodiAIDefaults | null) : null;
        set({ defaults, loaded: true });
        return defaults;
      } catch {
        set({ defaults: null, loaded: true });
        return null;
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  },

  clear: () => {
    inFlight = null;
    set({ defaults: null, loaded: false });
  },
}));

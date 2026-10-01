/**
 * The dodi AI per-category recommendations from platform_config
 * (`GET /api/ai/defaults` on the PLATFORM — non-secret display/config data).
 * This is what the "default" model sentinel in the account's model config
 * resolves against at call time, so improving a platform default upgrades
 * every non-customized account without touching user configs.
 */
import { createStore, type StoreApi } from "zustand/vanilla";

import type { DodiAIDefaults } from "@dodi/types/ai";

import type { PlatformApi } from "./platform";

export interface DodiAIDefaultsState {
  defaults: DodiAIDefaults | null;
  loaded: boolean;
  load: (force?: boolean) => Promise<DodiAIDefaults | null>;
  clear: () => void;
}

export type DodiAIDefaultsStore = StoreApi<DodiAIDefaultsState>;

export function createDodiAIDefaultsStore(api: PlatformApi): DodiAIDefaultsStore {
  let inFlight: Promise<DodiAIDefaults | null> | null = null;

  return createStore<DodiAIDefaultsState>()((set, get) => ({
    defaults: null,
    loaded: false,

    load: async (force = false) => {
      if (get().loaded && !force) return get().defaults;
      if (inFlight && !force) return inFlight;

      inFlight = (async () => {
        try {
          const res = await api.request("/api/ai/defaults");
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
}

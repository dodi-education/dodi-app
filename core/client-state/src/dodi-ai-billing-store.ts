/**
 * dodi AI billing snapshot (balance + "as of" timestamps) from
 * `GET ai.dodi.app/api/billing/status`. Reads the commercial ledger — the cron
 * pipeline keeps it fresh; xAI is never in this request path.
 */
import { createStore, type StoreApi } from "zustand/vanilla";

import { type BillingStatusResponse, BillingStatusResponseSchema } from "@dodi/billing-contract";

import type { DodiAIClient } from "./dodi-ai";

export interface DodiAIBillingState {
  billing: BillingStatusResponse | null;
  loaded: boolean;
  load: (force?: boolean) => Promise<BillingStatusResponse | null>;
  clear: () => void;
}

export type DodiAIBillingStore = StoreApi<DodiAIBillingState>;

export function createDodiAIBillingStore(dodiAI: DodiAIClient): DodiAIBillingStore {
  let inFlight: Promise<BillingStatusResponse | null> | null = null;

  return createStore<DodiAIBillingState>()((set, get) => ({
    billing: null,
    loaded: false,

    load: async (force = false) => {
      if (!dodiAI.isConfigured()) return null;
      if (get().loaded && !force) return get().billing;
      if (inFlight && !force) return inFlight;

      inFlight = (async () => {
        try {
          const res = await dodiAI.request("/api/billing/status");
          if (!res.ok) {
            set({ billing: null, loaded: true });
            return null;
          }
          const parsed = BillingStatusResponseSchema.safeParse(await res.json());
          const billing = parsed.success ? parsed.data : null;
          set({ billing, loaded: true });
          return billing;
        } catch {
          set({ billing: null, loaded: true });
          return null;
        } finally {
          inFlight = null;
        }
      })();
      return inFlight;
    },

    clear: () => {
      inFlight = null;
      set({ billing: null, loaded: false });
    },
  }));
}

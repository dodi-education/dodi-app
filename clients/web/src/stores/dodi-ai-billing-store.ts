/**
 * dodi AI billing snapshot (balance + "as of" timestamps) from
 * `GET ai.dodi.app/api/billing/status`. Reads the commercial ledger — the cron
 * pipeline keeps it fresh; xAI is never in this request path.
 */
import { create } from "zustand";

import { dodiAIRequest, isDodiAIConfigured } from "@/lib/dodi-ai";
import {
  type BillingStatusResponse,
  BillingStatusResponseSchema,
} from "@dodi/billing-contract";

interface DodiAIBillingState {
  billing: BillingStatusResponse | null;
  loaded: boolean;
  load: (force?: boolean) => Promise<BillingStatusResponse | null>;
  clear: () => void;
}

let inFlight: Promise<BillingStatusResponse | null> | null = null;

export const useDodiAIBillingStore = create<DodiAIBillingState>((set, get) => ({
  billing: null,
  loaded: false,

  load: async (force = false) => {
    if (!isDodiAIConfigured()) return null;
    if (get().loaded && !force) return get().billing;
    if (inFlight && !force) return inFlight;

    inFlight = (async () => {
      try {
        const res = await dodiAIRequest("/api/billing/status");
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

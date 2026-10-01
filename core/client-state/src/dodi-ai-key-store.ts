/**
 * dodi AI inference keys — session credentials, MEMORY ONLY. Never the vault,
 * never localStorage, never the platform DB. `GET /api/keys` is plain
 * mint-or-retrieve (the server rotates secrets on its own daily schedule);
 * when the daily rotation invalidates the held secret, a provider 401 leads
 * callers to `refresh()` and continue with the current one.
 */
import { createStore, type StoreApi } from "zustand/vanilla";

import {
  type InferenceKey,
  type InferenceProvider,
  KeysRefusalSchema,
  KeysResponseSchema,
} from "@dodi/billing-contract";

import type { DodiAIClient } from "./dodi-ai";

export type DodiAIKeyStatus = "idle" | "loading" | "active" | "no_balance" | "locked" | "error";

export interface DodiAIKeyState {
  keys: InferenceKey[] | null;
  status: DodiAIKeyStatus;
  load: (force?: boolean) => Promise<InferenceKey[] | null>;
  /** After a provider 401 (daily rotation): refetch the current secret. */
  refresh: () => Promise<InferenceKey[] | null>;
  getKey: (provider: InferenceProvider) => string | null;
  /** Sign-out / dodi AI disable: drop the secrets from memory. */
  clear: () => void;
}

export type DodiAIKeyStore = StoreApi<DodiAIKeyState>;

export function createDodiAIKeyStore(dodiAI: DodiAIClient): DodiAIKeyStore {
  let inFlight: Promise<InferenceKey[] | null> | null = null;

  return createStore<DodiAIKeyState>()((set, get) => ({
    keys: null,
    status: "idle",

    load: async (force = false) => {
      if (!dodiAI.isConfigured()) return null;
      const cached = get().keys;
      if (cached && !force) return cached;
      if (inFlight && !force) return inFlight;

      inFlight = (async () => {
        set({ status: "loading" });
        try {
          const res = await dodiAI.request("/api/keys");
          if (res.status === 402) {
            const body: unknown = await res.json().catch(() => null);
            KeysRefusalSchema.safeParse(body); // shape check only; balance shown via billing store
            set({ keys: null, status: "no_balance" });
            return null;
          }
          if (res.status === 403) {
            set({ keys: null, status: "locked" });
            return null;
          }
          if (!res.ok) {
            set({ keys: null, status: "error" });
            return null;
          }
          const parsed = KeysResponseSchema.safeParse(await res.json());
          if (!parsed.success) {
            set({ keys: null, status: "error" });
            return null;
          }
          set({ keys: parsed.data.keys, status: "active" });
          return parsed.data.keys;
        } catch {
          set({ keys: null, status: "error" });
          return null;
        } finally {
          inFlight = null;
        }
      })();
      return inFlight;
    },

    refresh: async () => get().load(true),

    getKey: (provider) => get().keys?.find((k) => k.provider === provider)?.apiKey ?? null,

    clear: () => {
      inFlight = null;
      set({ keys: null, status: "idle" });
    },
  }));
}

/**
 * dodi AI inference keys — session credentials, MEMORY ONLY. Never the vault,
 * never localStorage, never the platform DB. `GET /api/keys` is plain
 * mint-or-retrieve (the server rotates secrets on its own daily schedule);
 * when the daily rotation invalidates the held secret, a provider 401 leads
 * callers to `refresh()` and continue with the current one.
 */
import { create } from "zustand";

import { dodiAIRequest, isDodiAIConfigured } from "@/lib/dodi-ai";
import {
  type InferenceKey,
  type InferenceProvider,
  KeysRefusalSchema,
  KeysResponseSchema,
} from "@dodi/billing-contract";

export type DodiAIKeyStatus =
  | "idle"
  | "loading"
  | "active"
  | "no_balance"
  | "locked"
  | "error";

interface DodiAIKeyState {
  keys: InferenceKey[] | null;
  status: DodiAIKeyStatus;
  load: (force?: boolean) => Promise<InferenceKey[] | null>;
  /** After a provider 401 (daily rotation): refetch the current secret. */
  refresh: () => Promise<InferenceKey[] | null>;
  getKey: (provider: InferenceProvider) => string | null;
  /** Sign-out / dodi AI disable: drop the secrets from memory. */
  clear: () => void;
}

let inFlight: Promise<InferenceKey[] | null> | null = null;

export const useDodiAIKeyStore = create<DodiAIKeyState>((set, get) => ({
  keys: null,
  status: "idle",

  load: async (force = false) => {
    if (!isDodiAIConfigured()) return null;
    const cached = get().keys;
    if (cached && !force) return cached;
    if (inFlight && !force) return inFlight;

    inFlight = (async () => {
      set({ status: "loading" });
      try {
        const res = await dodiAIRequest("/api/keys");
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

  getKey: (provider) =>
    get().keys?.find((k) => k.provider === provider)?.apiKey ?? null,

  clear: () => {
    inFlight = null;
    set({ keys: null, status: "idle" });
  },
}));

/**
 * dodi AI inference keys — session credentials, MEMORY ONLY. Never the vault,
 * never localStorage, never the platform DB. `GET /api/keys` is plain
 * mint-or-retrieve (the server rotates secrets on its own schedule). Keys that
 * carry an `expiresAt` (Venice: every rotation mints a new key with a hard
 * expiry) are refetched by `ensureFresh()` before they run out; a provider 401
 * leads callers to `refresh()` and continue with the current one.
 */
import { createStore, type StoreApi } from "zustand/vanilla";

import {
  type InferenceKey,
  type InferenceProvider,
  KeysRefusalSchema,
  KeysResponseSchema,
} from "@dodi/billing-contract";

import type { DodiAIClient } from "./dodi-ai";

/** A held key is refetched once it has less than this left before `expiresAt`. */
export const KEY_MIN_REMAINING_MS = 30 * 60_000;
/**
 * …or once it was fetched this long ago. xAI keys carry no `expiresAt`: their
 * secret rotates daily with a 1h grace for the old one, so a key at most 30
 * min old is always still accepted when it is handed to a call.
 */
export const KEY_MAX_AGE_MS = 30 * 60_000;

export type DodiAIKeyStatus = "idle" | "loading" | "active" | "no_balance" | "locked" | "error";

export interface DodiAIKeyState {
  keys: InferenceKey[] | null;
  status: DodiAIKeyStatus;
  load: (force?: boolean) => Promise<InferenceKey[] | null>;
  /** After a provider 401 (daily rotation): refetch the current secret. */
  refresh: () => Promise<InferenceKey[] | null>;
  /**
   * `load()`, plus a refetch when any held key expires within
   * `KEY_MIN_REMAINING_MS` or was fetched more than `KEY_MAX_AGE_MS` ago —
   * call before handing a key to a provider call.
   */
  ensureFresh: () => Promise<InferenceKey[] | null>;
  getKey: (provider: InferenceProvider) => string | null;
  /** Sign-out / dodi AI disable: drop the secrets from memory. */
  clear: () => void;
}

export type DodiAIKeyStore = StoreApi<DodiAIKeyState>;

export function createDodiAIKeyStore(dodiAI: DodiAIClient): DodiAIKeyStore {
  let inFlight: Promise<InferenceKey[] | null> | null = null;
  let loadedAt = 0;

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
          loadedAt = Date.now();
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

    ensureFresh: async () => {
      const keys = await get().load();
      if (!keys) return null;
      const now = Date.now();
      const threshold = now + KEY_MIN_REMAINING_MS;
      const expiring = keys.some(
        (k) => k.expiresAt !== undefined && Date.parse(k.expiresAt) < threshold,
      );
      return expiring || now - loadedAt > KEY_MAX_AGE_MS ? get().load(true) : keys;
    },

    getKey: (provider) => get().keys?.find((k) => k.provider === provider)?.apiKey ?? null,

    clear: () => {
      inFlight = null;
      set({ keys: null, status: "idle" });
    },
  }));
}

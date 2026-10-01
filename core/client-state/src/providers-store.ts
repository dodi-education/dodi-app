/**
 * Client store for AI provider API keys — E2EE. Fetches the opaque blob from
 * `/api/ai/providers`, decrypts it with the VaultSession, caches the plaintext
 * keys in memory, and re-encrypts on every change. The server never sees a key.
 */
import { createStore, type StoreApi } from "zustand/vanilla";

import {
  type VaultProviders,
  decryptProviders,
  encryptProviders,
  providerKeyPreview,
} from "@dodi/vault";
import type { AIProviderId } from "@dodi/types/ai";

import type { PlatformApi } from "./platform";
import type { VaultStore } from "./vault-store";

export interface ProvidersStoreState {
  providers: VaultProviders | null;
  load: (force?: boolean) => Promise<VaultProviders>;
  addKey: (providerId: AIProviderId, apiKey: string) => Promise<void>;
  removeKey: (providerId: AIProviderId) => Promise<void>;
  /** Decrypted key for use in client-side AI calls (null if not configured). */
  getKey: (providerId: AIProviderId) => string | null;
  hasAny: () => boolean;
  invalidate: () => void;
}

export type ProvidersStore = StoreApi<ProvidersStoreState>;

export function createProvidersStore(api: PlatformApi, vault: VaultStore): ProvidersStore {
  const requireSession = () => {
    const session = vault.getState().session;
    if (!session) throw new Error("Vault is locked");
    return session;
  };

  const fetchBlob = async (): Promise<string | null> => {
    const res = await api.request("/api/ai/providers");
    if (!res.ok) throw new Error("Failed to load providers");
    const data = (await res.json()) as { encryptedProviders: string | null };
    return data.encryptedProviders ?? null;
  };

  const saveBlob = async (blob: string): Promise<void> => {
    const res = await api.request("/api/ai/providers", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ encryptedProviders: blob }),
    });
    if (!res.ok) throw new Error("Failed to save providers");
  };

  return createStore<ProvidersStoreState>()((set, get) => ({
    providers: null,

    load: async (force = false) => {
      const cached = get().providers;
      if (cached && !force) return cached;
      const blob = await fetchBlob();
      const providers = decryptProviders(requireSession(), blob);
      set({ providers });
      return providers;
    },

    addKey: async (providerId, apiKey) => {
      const current = get().providers ?? (await get().load());
      const updated: VaultProviders = {
        ...current,
        [providerId]: {
          key: apiKey,
          keyPreview: providerKeyPreview(apiKey),
          addedAt: new Date().toISOString(),
        },
      };
      await saveBlob(encryptProviders(requireSession(), updated));
      set({ providers: updated });
    },

    removeKey: async (providerId) => {
      const current = get().providers ?? (await get().load());
      const next: VaultProviders = { ...current };
      delete next[providerId];
      await saveBlob(encryptProviders(requireSession(), next));
      set({ providers: next });
    },

    getKey: (providerId) => get().providers?.[providerId]?.key ?? null,

    hasAny: () => Object.keys(get().providers ?? {}).length > 0,

    invalidate: () => set({ providers: null }),
  }));
}

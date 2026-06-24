/**
 * Client profile cache: fetch ciphertext once, decrypt once with the VaultSession,
 * and reuse the plaintext across navigation. Decrypted data lives in memory only
 * (never persisted). Mutations call `invalidate()` to force a refetch.
 */
import { dodi } from "@/lib/api";
import { create } from "zustand";

import type { VaultSession } from "@dodi/vault";
import { decryptProfile } from "@dodi/vault/profile-crypto";
import type { Profile } from "@dodi/types/database";

import { useVaultStore } from "./vault-store";

/**
 * Resolve once the vault has an unlocked session. On a cold load the silent
 * unlock runs in parallel with the first profiles fetch, so the session may
 * still be null when we get here — wait for it instead of throwing. Reject if
 * the vault settles into a terminal state without a session (unlock failed),
 * so callers don't hang forever.
 */
function awaitSession(): Promise<VaultSession> {
  const { session, status } = useVaultStore.getState();
  if (session) return Promise.resolve(session);
  // Already settled without a session (unlock failed / no vault) — fail now
  // rather than subscribe and wait for a state change that will never come.
  if (status === "locked" || status === "needs-setup") {
    return Promise.reject(new Error("Vault is locked"));
  }

  return new Promise<VaultSession>((resolve, reject) => {
    const unsubscribe = useVaultStore.subscribe((state) => {
      if (state.session) {
        unsubscribe();
        resolve(state.session);
      } else if (state.status === "locked" || state.status === "needs-setup") {
        unsubscribe();
        reject(new Error("Vault is locked"));
      }
    });
  });
}

interface ProfileStoreState {
  list: Profile[] | null;
  byId: Record<string, Profile>;
  loadList: (force?: boolean) => Promise<Profile[]>;
  loadOne: (id: string, force?: boolean) => Promise<Profile | null>;
  invalidate: () => void;
}

// Single-flight guards: concurrent callers (e.g. ProfileSwitcher + the home
// view mounting together) ride the same fetch+decrypt instead of each issuing
// their own. Cleared once settled so a later load refetches.
let listInFlight: Promise<Profile[]> | null = null;
const oneInFlight = new Map<string, Promise<Profile | null>>();

export const useProfileStore = create<ProfileStoreState>((set, get) => ({
  list: null,
  byId: {},

  loadList: async (force = false) => {
    const cached = get().list;
    if (cached && !force) return cached;
    if (listInFlight && !force) return listInFlight;

    listInFlight = (async () => {
      const res = await dodi.request("/api/profiles");
      if (!res.ok) throw new Error("Failed to load profiles");
      const rows = (await res.json()) as Profile[];
      const session = await awaitSession();
      const decrypted = rows.map((row) => decryptProfile(session, row));

      set((state) => ({
        list: decrypted,
        byId: {
          ...state.byId,
          ...Object.fromEntries(decrypted.map((p) => [p.id, p])),
        },
      }));
      return decrypted;
    })();

    try {
      return await listInFlight;
    } finally {
      listInFlight = null;
    }
  },

  loadOne: async (id, force = false) => {
    const cached = get().byId[id];
    if (cached && !force) return cached;
    const existing = oneInFlight.get(id);
    if (existing && !force) return existing;

    const pending = (async () => {
      const res = await dodi.request(`/api/profiles/${id}`);
      if (!res.ok) return null;
      const row = (await res.json()) as Profile;
      const decrypted = decryptProfile(await awaitSession(), row);

      set((state) => ({ byId: { ...state.byId, [id]: decrypted } }));
      return decrypted;
    })();

    oneInFlight.set(id, pending);
    try {
      return await pending;
    } finally {
      oneInFlight.delete(id);
    }
  },

  invalidate: () => set({ list: null, byId: {} }),
}));

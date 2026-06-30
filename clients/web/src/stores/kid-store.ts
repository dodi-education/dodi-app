/**
 * Client kid cache: fetch ciphertext once, decrypt once with the VaultSession,
 * and reuse the plaintext across navigation. Decrypted data lives in memory only
 * (never persisted). Mutations call `invalidate()` to force a refetch.
 */
import { dodi } from "@/lib/api";
import { create } from "zustand";

import type { VaultSession } from "@dodi/vault";
import { decryptKid } from "@dodi/vault/kid-crypto";
import type { Kid } from "@dodi/types/database";

import { useVaultStore } from "./vault-store";

/**
 * Resolve once the vault has an unlocked session. On a cold load the silent
 * unlock runs in parallel with the first kids fetch, so the session may
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

interface KidStoreState {
  list: Kid[] | null;
  byId: Record<string, Kid>;
  loadList: (force?: boolean) => Promise<Kid[]>;
  loadOne: (id: string, force?: boolean) => Promise<Kid | null>;
  /** Optimistically merge a patch into a cached kid (list + byId), no refetch. */
  patchLocal: (id: string, patch: Partial<Kid>) => void;
  invalidate: () => void;
}

// Single-flight guards: concurrent callers (e.g. KidSwitcher + the home
// view mounting together) ride the same fetch+decrypt instead of each issuing
// their own. Cleared once settled so a later load refetches.
let listInFlight: Promise<Kid[]> | null = null;
const oneInFlight = new Map<string, Promise<Kid | null>>();

export const useKidStore = create<KidStoreState>((set, get) => ({
  list: null,
  byId: {},

  loadList: async (force = false) => {
    const cached = get().list;
    if (cached && !force) return cached;
    if (listInFlight && !force) return listInFlight;

    listInFlight = (async () => {
      const res = await dodi.request("/api/kids");
      if (!res.ok) throw new Error("Failed to load kids");
      const rows = (await res.json()) as Kid[];
      const session = await awaitSession();
      const decrypted = rows.map((row) => decryptKid(session, row));

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
      const res = await dodi.request(`/api/kids/${id}`);
      if (!res.ok) return null;
      const row = (await res.json()) as Kid;
      const decrypted = decryptKid(await awaitSession(), row);

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

  patchLocal: (id, patch) =>
    set((state) => {
      const existing = state.byId[id];
      const merged = existing ? { ...existing, ...patch } : existing;
      return {
        byId: merged ? { ...state.byId, [id]: merged } : state.byId,
        list: state.list
          ? state.list.map((p) => (p.id === id ? { ...p, ...patch } : p))
          : state.list,
      };
    }),

  invalidate: () => set({ list: null, byId: {} }),
}));

/**
 * Client kid cache: fetch ciphertext once, decrypt once with the VaultSession,
 * and reuse the plaintext across navigation. Decrypted data lives in memory only
 * (never persisted). Mutations call `invalidate()` to force a refetch.
 * Kid CIPHERTEXT rows are additionally written through to the offline cache
 * (IndexedDB) and served from it when the network is unreachable.
 */
import { dodi } from "@/lib/api";
import { create } from "zustand";

import { offlineCache } from "@/lib/offline/offline-cache";
import { decryptKid } from "@dodi/vault/kid-crypto";
import type { Kid } from "@dodi/types/database";

import { awaitSession } from "./await-session";
import { useConnectivityStore } from "./connectivity-store";

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
      let rows: Kid[];
      try {
        const res = await dodi.request("/api/kids");
        if (!res.ok) throw new Error("Failed to load kids");
        rows = (await res.json()) as Kid[];
        useConnectivityStore.getState().reportOnline();
        void offlineCache.writeKidRows(rows);
      } catch (error) {
        // Network-level failure → serve the cached ciphertext rows.
        if (!(error instanceof TypeError)) throw error;
        const cached = await offlineCache.readKidRows<Kid>();
        if (!cached) throw error;
        useConnectivityStore.getState().reportOffline();
        rows = cached;
      }
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
      let row: Kid;
      try {
        const res = await dodi.request(`/api/kids/${id}`);
        if (!res.ok) return null;
        row = (await res.json()) as Kid;
      } catch (error) {
        // Offline: resolve from the cached list rows.
        if (!(error instanceof TypeError)) throw error;
        const cached = await offlineCache.readKidRows<Kid>();
        const cachedRow = cached?.find((k) => k.id === id);
        if (!cachedRow) throw error;
        useConnectivityStore.getState().reportOffline();
        row = cachedRow;
      }
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

/**
 * Avatars and accessories on dodi Discover, for the parent Discover page.
 *
 * Like Discover games this is play-in-place: "Add" writes this family's
 * sharing row on the single published asset (nothing is copied) and the
 * family's asset store lists it next to its own, so kids can wear it in the
 * Playground. Everything here is plaintext by design (a publication is a
 * voluntary disclosure), so there is no decryption step. Single-flight: one
 * list request at a time; the `is_added` flags follow the asset store, so
 * removing an added asset under Companions shows up here too.
 */
import { createStore, type StoreApi } from "zustand/vanilla";

import type { CharacterAssetKind } from "@dodi/types/database";

import type { CharacterAssetStore } from "./character-asset-store";
import { FlowError, serverErrorOf } from "./flow-error";
import type { PlatformApi } from "./platform";

/** GET /api/discover/character-assets, one card. */
export interface DiscoverAssetCard {
  id: string;
  kind: CharacterAssetKind;
  name: string;
  description: string;
  socket: string | null;
  byte_size: number;
  /** A data: URL, or null (show the kind's icon). */
  preview_image: string | null;
  publisher_handle: string | null;
  published_at: string;
  /** This family added it. */
  is_added: boolean;
}

export interface DiscoverAssetsState {
  /** Live cards, newest first; null until loaded. */
  cards: DiscoverAssetCard[] | null;
  load: (force?: boolean) => Promise<DiscoverAssetCard[]>;
  /** Add a live asset to the family (kids can then wear it). */
  add: (id: string) => Promise<void>;
  /** Take an added asset off the family again; looks wearing it fall back. */
  remove: (id: string) => Promise<void>;
  invalidate: () => void;
}

export type DiscoverAssetStore = StoreApi<DiscoverAssetsState>;

export interface DiscoverAssetDeps {
  api: PlatformApi;
  /** Invalidated on add/remove; its list keeps `is_added` in step. */
  characterAssets: CharacterAssetStore;
}

export function createDiscoverAssetStore({ api, characterAssets }: DiscoverAssetDeps): DiscoverAssetStore {
  let listing: Promise<DiscoverAssetCard[]> | null = null;

  const store = createStore<DiscoverAssetsState>()((set, get) => {
    const patchAdded = (id: string, isAdded: boolean): void => {
      const cards = get().cards;
      if (cards) set({ cards: cards.map((c) => (c.id === id ? { ...c, is_added: isAdded } : c)) });
    };

    async function setSharing(id: string, method: "PUT" | "DELETE"): Promise<void> {
      const res = await api.request(`/api/discover/character-assets/${id}/sharing`, { method });
      if (!res.ok) throw new FlowError("request_failed", await serverErrorOf(res));
      patchAdded(id, method === "PUT");
      characterAssets.getState().invalidate();
    }

    return {
      cards: null,

      load: (force = false) => {
        const cached = get().cards;
        if (cached && !force) return Promise.resolve(cached);
        if (listing && !force) return listing;
        const promise = (async () => {
          const res = await api.request("/api/discover/character-assets");
          if (!res.ok) throw new FlowError("request_failed", await serverErrorOf(res));
          const cards = (await res.json()) as DiscoverAssetCard[];
          set({ cards });
          return cards;
        })();
        listing = promise;
        void promise
          .finally(() => {
            if (listing === promise) listing = null;
          })
          .catch(() => {});
        return promise;
      },

      add: (id) => setSharing(id, "PUT"),
      remove: (id) => setSharing(id, "DELETE"),

      invalidate: () => {
        listing = null;
        set({ cards: null });
      },
    };
  });

  // A shared asset removed elsewhere (the Companions list) is no longer added here.
  characterAssets.subscribe(({ assets }) => {
    const cards = store.getState().cards;
    if (!assets || !cards) return;
    const added = new Set(assets.filter((a) => a.isShared).map((a) => a.id));
    if (cards.every((c) => c.is_added === added.has(c.id))) return;
    store.setState({ cards: cards.map((c) => ({ ...c, is_added: added.has(c.id) })) });
  });

  return store;
}

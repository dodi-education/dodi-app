/**
 * A family's own avatars and accessories (character_assets), opened. They
 * come from the dodi CLI (sealed there with the same vault key); the apps
 * list them, show them in the Playground's Look pickers and let a parent
 * delete them. Single-flight: one list request at a time, and each file is
 * fetched and decrypted once, on demand (the renderer asks when a look wears
 * it), then kept in memory for the session.
 *
 * The list also carries the published assets the family added from Discover
 * (`isShared`): plaintext by design (a voluntary publication), files from the
 * discover file route, and "removing" one drops the family's sharing row
 * rather than deleting anything. Looks refer to both kinds as `custom:<uuid>`.
 */
import { createStore, type StoreApi } from "zustand/vanilla";

import {
  customAssetIdOf,
  isCustomAssetRef,
  type AccessoryRef,
  type CharacterModelRef,
} from "@dodi/character/character-catalog";
import { sanitizeLook, type CompanionLook } from "@dodi/character/character-look";
import type { CharacterAsset, CharacterAssetSummary } from "@dodi/types/database";
import {
  base64ToBytes,
  decryptCharacterAsset,
  decryptCharacterAssetGlb,
  type CharacterAssetView,
} from "@dodi/vault/character-asset-crypto";

import { awaitSession } from "./await-session";
import { FlowError, serverErrorOf } from "./flow-error";
import type { PlatformApi } from "./platform";
import type { VaultStore } from "./vault-store";

export type { CharacterAssetView } from "@dodi/vault/character-asset-crypto";

/** A listed asset: one of the family's own (sealed) or one it added from Discover. */
export interface CharacterAssetEntry extends CharacterAssetView {
  /** Added from Discover (plaintext, someone else's); false for the family's own. */
  isShared: boolean;
  /** The publisher's public byline, for shared assets; null for the family's own. */
  publisherHandle: string | null;
}

/** GET /api/character-assets/shared, one row (plaintext). */
export interface SharedCharacterAssetRow {
  id: string;
  kind: CharacterAssetView["kind"];
  name: string;
  description: string;
  socket: string | null;
  byte_size: number;
  publisher_handle: string | null;
}

function sharedEntryOf(row: SharedCharacterAssetRow): CharacterAssetEntry {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    meta: {
      v: 1,
      ...(row.description ? { description: row.description } : {}),
      ...(row.socket ? { socket: row.socket } : {}),
    },
    byteSize: row.byte_size,
    // Published files change only through review; "" keeps one cached copy per session.
    createdAt: "",
    updatedAt: "",
    isShared: true,
    publisherHandle: row.publisher_handle,
  };
}

async function listShared(api: PlatformApi): Promise<SharedCharacterAssetRow[]> {
  const res = await api.request("/api/character-assets/shared");
  if (res.status === 404) return []; // a platform without Discover assets
  if (!res.ok) throw new FlowError("request_failed", await serverErrorOf(res));
  return (await res.json()) as SharedCharacterAssetRow[];
}

/** Mirrors MAX_CHARACTER_ASSETS_PER_ACCOUNT on the platform. */
export const MAX_CHARACTER_ASSETS_PER_ACCOUNT = 50;

export interface CharacterAssetsState {
  /** The family's own assets (opened, oldest first), then the ones it added from Discover; null until loaded. */
  assets: CharacterAssetEntry[] | null;
  load: (force?: boolean) => Promise<CharacterAssetEntry[]>;
  /** An asset's .glb bytes, fetched (and opened) once per session (rejects if it is gone). */
  getBytes: (assetId: string) => Promise<Uint8Array>;
  /**
   * Parents only (the platform refuses agents): deletes an own asset, or
   * removes a shared one from the family. Looks that wear it fall back on their own.
   */
  remove: (assetId: string) => Promise<void>;
  invalidate: () => void;
}

export type CharacterAssetStore = StoreApi<CharacterAssetsState>;

export interface CharacterAssetDeps {
  api: PlatformApi;
  vault: VaultStore;
}

export function createCharacterAssetStore({ api, vault }: CharacterAssetDeps): CharacterAssetStore {
  let listing: Promise<CharacterAssetEntry[]> | null = null;
  // id → opened bytes, keyed with the row's updated_at so a replaced file reloads.
  const files = new Map<string, { version: string; bytes: Promise<Uint8Array> }>();

  function versionOf(assetId: string, assets: CharacterAssetEntry[] | null): string {
    return assets?.find((a) => a.id === assetId)?.updatedAt ?? "";
  }

  async function sharedBytes(assetId: string): Promise<Uint8Array> {
    const res = await api.request(`/api/discover/character-assets/${assetId}/file`);
    if (!res.ok) throw new FlowError("request_failed", await serverErrorOf(res));
    const file = (await res.json()) as { glb_base64: string };
    return base64ToBytes(file.glb_base64);
  }

  async function ownBytes(assetId: string): Promise<Uint8Array> {
    const res = await api.request(`/api/character-assets/${assetId}`);
    // Not ours (or not listed yet): it may be one the family added from Discover.
    if (res.status === 404) return sharedBytes(assetId);
    if (!res.ok) throw new FlowError("request_failed", await serverErrorOf(res));
    const row = (await res.json()) as CharacterAsset;
    const session = await awaitSession(vault);
    return decryptCharacterAssetGlb(session, row);
  }

  const store = createStore<CharacterAssetsState>()((set, get) => ({
    assets: null,

    load: (force = false) => {
      const cached = get().assets;
      if (cached && !force) return Promise.resolve(cached);
      if (listing && !force) return listing;
      const promise = (async () => {
        const [res, shared] = await Promise.all([api.request("/api/character-assets"), listShared(api)]);
        if (!res.ok) throw new FlowError("request_failed", await serverErrorOf(res));
        const rows = (await res.json()) as CharacterAssetSummary[];
        const session = await awaitSession(vault);
        const own = rows.flatMap((row): CharacterAssetEntry[] => {
          const view = decryptCharacterAsset(session, row);
          return view ? [{ ...view, isShared: false, publisherHandle: null }] : [];
        });
        const ownIds = new Set(own.map((a) => a.id));
        const assets = [...own, ...shared.filter((row) => !ownIds.has(row.id)).map(sharedEntryOf)];
        set({ assets });
        return assets;
      })();
      listing = promise;
      void promise
        .finally(() => {
          if (listing === promise) listing = null;
        })
        .catch(() => {});
      return promise;
    },

    getBytes: (assetId) => {
      const version = versionOf(assetId, get().assets);
      const cached = files.get(assetId);
      if (cached && (cached.version === version || version === "")) return cached.bytes;
      const isShared = get().assets?.find((a) => a.id === assetId)?.isShared === true;
      const bytes = isShared ? sharedBytes(assetId) : ownBytes(assetId);
      files.set(assetId, { version, bytes });
      bytes.catch(() => {
        if (files.get(assetId)?.bytes === bytes) files.delete(assetId); // a later look may retry
      });
      return bytes;
    },

    remove: async (assetId) => {
      const isShared = get().assets?.find((a) => a.id === assetId)?.isShared === true;
      const path = isShared
        ? `/api/discover/character-assets/${assetId}/sharing`
        : `/api/character-assets/${assetId}`;
      const res = await api.request(path, { method: "DELETE" });
      if (!res.ok && res.status !== 404) throw new FlowError("request_failed", await serverErrorOf(res));
      files.delete(assetId);
      const current = get().assets;
      if (current) set({ assets: current.filter((a) => a.id !== assetId) });
    },

    invalidate: () => {
      files.clear();
      listing = null;
      set({ assets: null });
    },
  }));
  return store;
}

// ----- Helpers for the Look pickers and the renderer ---------------------------

/** The ids sanitizeLook may keep (customAssetIds); null while not loaded (keep everything). */
export function customAssetIdsOf(assets: readonly CharacterAssetView[] | null): ReadonlySet<string> | null {
  return assets ? new Set(assets.map((a) => a.id)) : null;
}

/** Custom accessory id → the socket it rides on (from its sealed meta). */
export function customSocketsOf(assets: readonly CharacterAssetView[] | null): ReadonlyMap<string, string> {
  const sockets = new Map<string, string>();
  for (const asset of assets ?? []) {
    if (asset.kind === "accessory" && asset.meta.socket) sockets.set(asset.id, asset.meta.socket);
  }
  return sockets;
}

/** A custom ref's display name; null for catalog refs or unknown assets. */
export function customAssetNameOf(
  ref: CharacterModelRef | AccessoryRef,
  assets: readonly CharacterAssetView[] | null,
): string | null {
  const id = customAssetIdOf(ref);
  if (id === null) return null;
  return assets?.find((a) => a.id === id)?.name ?? null;
}

/** Whether a look wears any of the family's own assets. */
export function hasCustomAssetRefs(look: CompanionLook): boolean {
  return isCustomAssetRef(look.model) || look.accessories.some(isCustomAssetRef);
}

/**
 * The look as it can be shown: custom refs only to assets that exist and are
 * of the right kind (an avatar as the model, accessories as accessories);
 * anything else falls back (sanitizeLook). Null while the look needs the
 * asset list and it hasn't loaded, so a deleted avatar is never fetched.
 */
export function lookWithKnownAssets(
  look: CompanionLook,
  assets: readonly CharacterAssetView[] | null,
): CompanionLook | null {
  if (!hasCustomAssetRefs(look)) return look;
  if (!assets) return null;
  const idsOf = (kind: CharacterAssetView["kind"]): Set<string> =>
    new Set(assets.filter((a) => a.kind === kind).map((a) => a.id));
  const withModel = sanitizeLook({ ...look, accessories: [] }, { customAssetIds: idsOf("avatar") });
  const { accessories } = sanitizeLook(look, { customAssetIds: idsOf("accessory") });
  return { ...withModel, accessories };
}

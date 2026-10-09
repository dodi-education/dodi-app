import { describe, expect, it } from "vitest";

import { customAssetRef } from "@dodi/character/character-catalog";
import { bytesToBase64, encryptCharacterAssetFields } from "@dodi/vault/character-asset-crypto";

import {
  createCharacterAssetStore,
  customAssetIdsOf,
  customAssetNameOf,
  customSocketsOf,
  hasCustomAssetRefs,
  lookWithKnownAssets,
} from "./character-asset-store";
import { json, lockedVault, routedApi, unlockedVault } from "./parent-pages.test-support";

const HAT = "6f1c1d1e-0000-4000-8000-000000000002";
const ROBOT = "6f1c1d1e-0000-4000-8000-000000000003";
const SHARED = "6f1c1d1e-0000-4000-8000-000000000004";

describe("character asset store", () => {
  it("lists and opens the family's assets once, dropping ones that don't open", async () => {
    const { vault, session } = unlockedVault();
    const hat = encryptCharacterAssetFields(session, { name: "Wizard hat", meta: { v: 1, socket: "socket_head_top" } });
    const robot = encryptCharacterAssetFields(session, { name: "Robot" });
    const row = { byte_size: 10, created_at: "t", updated_at: "t" };
    const api = routedApi({
      "/api/character-assets": json([
        { id: HAT, kind: "accessory", name_enc: hat.name_enc, meta_enc: hat.meta_enc, ...row },
        { id: ROBOT, kind: "avatar", name_enc: robot.name_enc, meta_enc: null, ...row },
        { id: "bad", kind: "avatar", name_enc: "enc:v1:garbage", meta_enc: null, ...row },
      ]),
      "/api/character-assets/shared": json([]),
    });
    const store = createCharacterAssetStore({ api, vault });
    const [first, again] = await Promise.all([store.getState().load(), store.getState().load()]);
    expect(first).toBe(again);
    expect(api.request).toHaveBeenCalledTimes(2); // own + shared, once
    expect(first.every((a) => !a.isShared)).toBe(true);
    expect(first.map((a) => [a.id, a.kind, a.name])).toEqual([
      [HAT, "accessory", "Wizard hat"],
      [ROBOT, "avatar", "Robot"],
    ]);
    expect(customAssetIdsOf(first)).toEqual(new Set([HAT, ROBOT]));
    expect(customAssetIdsOf(null)).toBeNull();
    expect(customSocketsOf(first)).toEqual(new Map([[HAT, "socket_head_top"]]));
    expect(customAssetNameOf(customAssetRef(ROBOT), first)).toBe("Robot");
    expect(customAssetNameOf("dodi", first)).toBeNull();
  });

  it("fetches and opens a file once, and forgets a deleted asset", async () => {
    const { vault, session } = unlockedVault();
    const glb = new Uint8Array([1, 2, 3, 4, 5]);
    const sealed = encryptCharacterAssetFields(session, { name: "Hat", glb });
    const api = routedApi({
      [`/api/character-assets/${HAT}`]: json({ id: HAT, kind: "accessory", glb_enc: sealed.glb_enc }),
      [`DELETE /api/character-assets/${HAT}`]: json({ success: true }),
    });
    const store = createCharacterAssetStore({ api, vault });
    const [a, b] = await Promise.all([store.getState().getBytes(HAT), store.getState().getBytes(HAT)]);
    expect(a).toEqual(glb);
    expect(b).toBe(a);
    expect(api.request).toHaveBeenCalledTimes(1);
    store.setState({
      assets: [
        {
          id: HAT,
          kind: "accessory",
          name: "Hat",
          meta: { v: 1 },
          byteSize: 5,
          createdAt: "t",
          updatedAt: "t",
          isShared: false,
          publisherHandle: null,
        },
      ],
    });
    await store.getState().remove(HAT);
    expect(store.getState().assets).toEqual([]);
  });

  it("lists added Discover assets after the family's own, as known custom assets", async () => {
    const { vault, session } = unlockedVault();
    const robot = encryptCharacterAssetFields(session, { name: "Robot" });
    const api = routedApi({
      "/api/character-assets": json([
        { id: ROBOT, kind: "avatar", name_enc: robot.name_enc, meta_enc: null, byte_size: 9, created_at: "t", updated_at: "t" },
      ]),
      "/api/character-assets/shared": json([
        {
          id: SHARED,
          kind: "accessory",
          name: "Crown",
          description: "Shiny",
          socket: "socket_head_top",
          byte_size: 4,
          publisher_handle: "maker",
        },
      ]),
    });
    const store = createCharacterAssetStore({ api, vault });
    const assets = await store.getState().load();
    expect(assets.map((a) => [a.id, a.isShared, a.publisherHandle])).toEqual([
      [ROBOT, false, null],
      [SHARED, true, "maker"],
    ]);
    expect(assets[1]?.meta).toEqual({ v: 1, description: "Shiny", socket: "socket_head_top" });
    expect(customAssetIdsOf(assets)).toEqual(new Set([ROBOT, SHARED]));
    expect(customSocketsOf(assets)).toEqual(new Map([[SHARED, "socket_head_top"]]));
    const look = { v: 1 as const, model: customAssetRef(ROBOT), colors: {}, accessories: [customAssetRef(SHARED)] };
    expect(lookWithKnownAssets(look, assets)).toEqual(look);
  });

  it("loads a shared file without the vault and removes a shared asset by dropping the sharing", async () => {
    const glb = new Uint8Array([9, 8, 7, 6]);
    const api = routedApi({
      [`/api/discover/character-assets/${SHARED}/file`]: json({ kind: "accessory", glb_base64: bytesToBase64(glb) }),
      [`DELETE /api/discover/character-assets/${SHARED}/sharing`]: json({ ok: true }),
    });
    const store = createCharacterAssetStore({ api, vault: lockedVault() });
    const shared = {
      id: SHARED,
      kind: "accessory" as const,
      name: "Crown",
      meta: { v: 1 as const },
      byteSize: 4,
      createdAt: "",
      updatedAt: "",
      isShared: true,
      publisherHandle: "maker",
    };
    store.setState({ assets: [shared] });
    const [a, b] = await Promise.all([store.getState().getBytes(SHARED), store.getState().getBytes(SHARED)]);
    expect(a).toEqual(glb);
    expect(b).toBe(a);
    await store.getState().remove(SHARED);
    expect(api.request).toHaveBeenCalledWith(`/api/discover/character-assets/${SHARED}/sharing`, { method: "DELETE" });
    expect(store.getState().assets).toEqual([]);
  });

  it("falls back to the discover file when an unlisted id is not the family's own", async () => {
    const glb = new Uint8Array([1, 1, 2, 3]);
    const api = routedApi({
      [`/api/character-assets/${SHARED}`]: json({ error: "not_found" }, 404),
      [`/api/discover/character-assets/${SHARED}/file`]: json({ kind: "avatar", glb_base64: bytesToBase64(glb) }),
    });
    const store = createCharacterAssetStore({ api, vault: lockedVault() });
    await expect(store.getState().getBytes(SHARED)).resolves.toEqual(glb);
  });
});

describe("lookWithKnownAssets", () => {
  const view = (id: string, kind: "avatar" | "accessory") => ({
    isShared: false,
    publisherHandle: null,
    id,
    kind,
    name: id,
    meta: { v: 1 as const },
    byteSize: 1,
    createdAt: "t",
    updatedAt: "t",
  });
  const look = {
    v: 1 as const,
    model: customAssetRef(ROBOT),
    colors: {},
    accessories: ["glasses" as const, customAssetRef(HAT)],
  };

  it("passes a catalog look through and waits for the list otherwise", () => {
    const plain = { v: 1 as const, model: "dodi" as const, colors: {}, accessories: [] };
    expect(lookWithKnownAssets(plain, null)).toBe(plain);
    expect(hasCustomAssetRefs(look)).toBe(true);
    expect(lookWithKnownAssets(look, null)).toBeNull();
  });

  it("keeps existing assets of the right kind and falls back for the rest", () => {
    expect(lookWithKnownAssets(look, [view(ROBOT, "avatar"), view(HAT, "accessory")])).toEqual(look);
    expect(lookWithKnownAssets(look, [])).toEqual({ v: 1, model: "dodi", colors: {}, accessories: ["glasses"] });
    // Wrong kinds: an accessory as the avatar, an avatar as an accessory.
    expect(lookWithKnownAssets(look, [view(ROBOT, "accessory"), view(HAT, "avatar")])).toEqual({
      v: 1,
      model: "dodi",
      colors: {},
      accessories: ["glasses"],
    });
  });
});

import { describe, expect, it } from "vitest";

import { createCharacterAssetStore } from "./character-asset-store";
import { createDiscoverAssetStore } from "./discover-character-assets";
import { json, routedApi, unlockedVault } from "./parent-pages.test-support";

const CROWN = "6f1c1d1e-0000-4000-8000-000000000005";
const card = (isAdded: boolean) => ({
  id: CROWN,
  kind: "accessory",
  name: "Crown",
  description: "Shiny",
  socket: "socket_head_top",
  byte_size: 4,
  preview_image: null,
  publisher_handle: "maker",
  published_at: "t",
  is_added: isAdded,
});
const sharedRow = {
  id: CROWN,
  kind: "accessory",
  name: "Crown",
  description: "Shiny",
  socket: "socket_head_top",
  byte_size: 4,
  publisher_handle: "maker",
};

describe("discover asset store", () => {
  it("lists live cards once", async () => {
    const api = routedApi({ "/api/discover/character-assets": json([card(false)]) });
    const store = createDiscoverAssetStore({
      api,
      characterAssets: createCharacterAssetStore({ api, vault: unlockedVault().vault }),
    });
    const [a, b] = await Promise.all([store.getState().load(), store.getState().load()]);
    expect(b).toBe(a);
    expect(api.request).toHaveBeenCalledTimes(1);
    expect(a.map((c) => c.name)).toEqual(["Crown"]);
  });

  it("adds and removes through the sharing route and refreshes the family's assets", async () => {
    const api = routedApi({
      "/api/discover/character-assets": json([card(false)]),
      [`PUT /api/discover/character-assets/${CROWN}/sharing`]: json({ ok: true }),
      [`DELETE /api/discover/character-assets/${CROWN}/sharing`]: json({ ok: true }),
      "/api/character-assets": () => json([]),
      "/api/character-assets/shared": () => json([sharedRow]),
    });
    const characterAssets = createCharacterAssetStore({ api, vault: unlockedVault().vault });
    const store = createDiscoverAssetStore({ api, characterAssets });
    await store.getState().load();
    await characterAssets.getState().load();
    await store.getState().add(CROWN);
    expect(store.getState().cards?.[0]?.is_added).toBe(true);
    expect(characterAssets.getState().assets).toBeNull(); // invalidated: the Playground reloads it
    await characterAssets.getState().load();
    expect(characterAssets.getState().assets?.map((a) => [a.id, a.isShared])).toEqual([[CROWN, true]]);
    await store.getState().remove(CROWN);
    expect(store.getState().cards?.[0]?.is_added).toBe(false);
  });

  it("follows a shared asset removed from the family elsewhere", async () => {
    const api = routedApi({
      "/api/discover/character-assets": json([card(true)]),
      "/api/character-assets": () => json([]),
      "/api/character-assets/shared": () => json([sharedRow]),
      [`DELETE /api/discover/character-assets/${CROWN}/sharing`]: json({ ok: true }),
    });
    const characterAssets = createCharacterAssetStore({ api, vault: unlockedVault().vault });
    const store = createDiscoverAssetStore({ api, characterAssets });
    await store.getState().load();
    await characterAssets.getState().load();
    await characterAssets.getState().remove(CROWN);
    expect(store.getState().cards?.[0]?.is_added).toBe(false);
  });
});

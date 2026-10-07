import { describe, expect, it, vi } from "vitest";
import { createStore } from "zustand/vanilla";

import { createConnectivityStore } from "./connectivity-store";
import type { GameStore, GameStoreState, LibraryGame } from "./game-store";
import { createInMemoryOfflineBackend, createOfflineCache } from "./offline-cache";
import { startOfflineWarmup, warmKidForOffline, type OfflineWarmupDeps } from "./offline-warmup";
import type { SnapshotDeps } from "./snapshots";

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function json(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function setup(opts: { isOnline?: boolean } = {}) {
  const connectivity = createConnectivityStore(opts.isOnline ?? true);
  const offline = createOfflineCache({ backend: createInMemoryOfflineBackend(), vaultKeys: null });
  const games = [
    { id: "g1", preview_image: "/images/game-previews/comets.webp" },
    { id: "g2", preview_image: "data:image/png;base64,AAAA" },
    { id: "g3", preview_image: null },
  ] as unknown as LibraryGame[];
  const loadForKid = vi.fn(async () => games);
  const gameStore = createStore(() => ({ loadForKid }) as unknown as GameStoreState) as GameStore;
  const request = vi.fn(async (path: string) => {
    if (path.startsWith("/api/snapshots?")) return json([{ id: "s1" }, { id: "s2" }]);
    const id = decodeURIComponent(path.split("/").pop() ?? "");
    return json({ id, payloadEnc: `enc:v1:${id}`, payloadBytes: 10 });
  });
  const snapshots: SnapshotDeps = {
    api: { request },
    connectivity,
    offline,
    friends: { ensureFriendKeys: vi.fn(), listFriends: vi.fn() },
  };
  const prefetchPreviewImage = vi.fn(async () => {});
  const deps: OfflineWarmupDeps = { games: gameStore, snapshots, connectivity, prefetchPreviewImage };
  return { deps, connectivity, offline, loadForKid, request, prefetchPreviewImage };
}

describe("offline warm-up", () => {
  it("loads the kid's games and caches the snapshot list and payloads", async () => {
    const { deps, offline, loadForKid } = setup();
    warmKidForOffline(deps, "kid-1");
    await flush();
    await flush();

    expect(loadForKid).toHaveBeenCalledWith("kid-1");
    expect(await offline.readSnapshotList("kid-1")).toEqual([{ id: "s1" }, { id: "s2" }]);
    expect(await offline.cachedSnapshotPayloadIds()).toEqual(new Set(["s1", "s2"]));
    expect(await offline.readSnapshotPayload("s2")).toMatchObject({ payloadEnc: "enc:v1:s2" });
  });

  it("warms only path-based previews (system games)", async () => {
    const { deps, prefetchPreviewImage } = setup();
    warmKidForOffline(deps, "kid-1");
    await flush();

    expect(prefetchPreviewImage.mock.calls).toEqual([["/images/game-previews/comets.webp"]]);
  });

  it("does nothing while offline", async () => {
    const { deps, loadForKid, request } = setup({ isOnline: false });
    warmKidForOffline(deps, "kid-1");
    await flush();

    expect(loadForKid).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it("swallows failures (the online path stays untouched)", async () => {
    const { deps, loadForKid, request, prefetchPreviewImage } = setup();
    loadForKid.mockRejectedValueOnce(new TypeError("Network request failed"));
    request.mockRejectedValueOnce(new TypeError("Network request failed"));
    prefetchPreviewImage.mockRejectedValue(new Error("image"));

    expect(() => warmKidForOffline(deps, "kid-1")).not.toThrow();
    await flush();
  });

  it("warms again on every offline→online transition until stopped", async () => {
    const { deps, connectivity, loadForKid } = setup();
    const stop = startOfflineWarmup(deps, "kid-1");
    expect(loadForKid).toHaveBeenCalledTimes(1);

    connectivity.getState().reportOffline();
    connectivity.getState().reportOnline();
    expect(loadForKid).toHaveBeenCalledTimes(2);

    stop();
    connectivity.getState().reportOffline();
    connectivity.getState().reportOnline();
    expect(loadForKid).toHaveBeenCalledTimes(2);
    await flush();
  });
});

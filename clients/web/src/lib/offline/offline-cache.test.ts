import { beforeEach, describe, expect, it } from "vitest";

import {
  createInMemoryOfflineBackend,
  createOfflineCache,
  type OfflineCacheBackend,
} from "./offline-cache";

/**
 * The browser binding of the shared device cache. The cache logic (keys,
 * snapshot budget, pending-autosave queue) is covered in
 * `@dodi/client-state/offline-cache`; this covers what the web adds: the
 * vault keys sealed under a non-extractable key inside the `kv` store.
 */
describe("offline cache (web)", () => {
  let backend: OfflineCacheBackend;
  let cache: ReturnType<typeof createOfflineCache>;

  beforeEach(() => {
    backend = createInMemoryOfflineBackend();
    cache = createOfflineCache(backend);
  });

  it("round-trips rows through the backend", async () => {
    const games = [{ id: "g1", code_bundle: "enc:v1:k:n:c" }];
    await cache.writeGameRows("kid-1", games);

    expect(await cache.readGameRows("kid-1")).toEqual(games);
    expect(await backend.get("kv", "games:kid-1")).toEqual(games);
  });

  it("seals vault keys at rest and round-trips them", async () => {
    const keys = { v: 1, deviceWraps: [{ deviceId: "d1", wrap: "..." }] };
    await cache.writeVaultKeys(keys);

    expect(await cache.readVaultKeys()).toEqual(keys);

    // The stored record must be ciphertext — never the JSON itself.
    const raw = (await backend.get("kv", "vault-keys")) as {
      ciphertext?: ArrayBuffer;
      key?: CryptoKey;
    };
    expect(raw.ciphertext).toBeInstanceOf(ArrayBuffer);
    expect(raw.key).toBeDefined();
    expect(JSON.stringify(raw)).not.toContain("deviceWraps");
    expect(new TextDecoder().decode(raw.ciphertext)).not.toContain("d1");
  });

  it("reads a tampered vault-keys record as a miss", async () => {
    await cache.writeVaultKeys({ v: 1 });
    const raw = (await backend.get("kv", "vault-keys")) as {
      ciphertext: ArrayBuffer;
    };
    new Uint8Array(raw.ciphertext)[0] ^= 0xff;

    expect(await cache.readVaultKeys()).toBeNull();
  });

  it("clearAll wipes the sealed vault keys and every store", async () => {
    await cache.writeVaultKeys({ v: 1 });
    await cache.writeGameRows("kid-1", [{ id: "g1" }]);
    await cache.writeSnapshotPayload("s1", { id: "s1" }, 1);
    await cache.writePendingAutosave("k1", "g1", { payloadEnc: "one" });

    await cache.clearAll();

    expect(await cache.readVaultKeys()).toBeNull();
    expect(await cache.readGameRows("kid-1")).toBeNull();
    expect(await cache.readSnapshotPayload("s1")).toBeNull();
    expect(await cache.readPendingAutosaves()).toEqual([]);
  });

  it("degrades to a no-op without a backend (SSR/private mode)", async () => {
    const nullCache = createOfflineCache(null);
    await expect(nullCache.writeVaultKeys({ v: 1 })).resolves.toBeUndefined();
    expect(await nullCache.readVaultKeys()).toBeNull();
    await expect(nullCache.writeGameRows("k", [])).resolves.toBeUndefined();
    expect(await nullCache.readGameRows("k")).toBeNull();
    expect(await nullCache.readPendingAutosaves()).toEqual([]);
    expect(await nullCache.cachedSnapshotPayloadIds()).toEqual(new Set());
    await expect(nullCache.clearAll()).resolves.toBeUndefined();
  });
});

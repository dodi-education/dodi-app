import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createInMemoryOfflineBackend,
  createOfflineCache,
  type OfflineCacheBackend,
} from "./offline-cache";

describe("offline cache", () => {
  let backend: OfflineCacheBackend;
  let cache: ReturnType<typeof createOfflineCache>;

  beforeEach(() => {
    backend = createInMemoryOfflineBackend();
    cache = createOfflineCache(backend);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("round-trips kid, game and snapshot-list rows per scope", async () => {
    const games = [{ id: "g1", code_bundle: "enc:v1:k:n:c" }];
    await cache.writeGameRows("kid-1", games);
    await cache.writeKidRows([{ id: "kid-1" }]);
    await cache.writeSnapshotList("kid-1", [{ id: "s1" }]);

    expect(await cache.readGameRows("kid-1")).toEqual(games);
    expect(await cache.readGameRows("kid-2")).toBeNull();
    expect(await cache.readKidRows()).toEqual([{ id: "kid-1" }]);
    expect(await cache.readSnapshotList("kid-1")).toEqual([{ id: "s1" }]);
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

  it("evicts the oldest snapshot payloads beyond the byte budget", async () => {
    const six = 6 * 1024 * 1024;
    await cache.writeSnapshotPayload("s1", { id: "s1" }, six);
    vi.advanceTimersByTime(1000);
    await cache.writeSnapshotPayload("s2", { id: "s2" }, six);
    vi.advanceTimersByTime(1000);
    // 18 MB total > 15 MB budget → the oldest (s1) is evicted.
    await cache.writeSnapshotPayload("s3", { id: "s3" }, six);

    expect(await cache.readSnapshotPayload("s1")).toBeNull();
    expect(await cache.readSnapshotPayload("s2")).toEqual({ id: "s2" });
    expect(await cache.readSnapshotPayload("s3")).toEqual({ id: "s3" });
    expect(await cache.cachedSnapshotPayloadIds()).toEqual(new Set(["s2", "s3"]));
  });

  it("evicts the oldest snapshot payloads beyond the item cap", async () => {
    for (let i = 0; i < 21; i++) {
      await cache.writeSnapshotPayload(`s${i}`, { id: `s${i}` }, 1);
      vi.advanceTimersByTime(1000);
    }
    expect(await cache.readSnapshotPayload("s0")).toBeNull();
    expect(await cache.readSnapshotPayload("s20")).toEqual({ id: "s20" });
    expect((await cache.cachedSnapshotPayloadIds()).size).toBe(20);
  });

  it("orders pending autosaves oldest-first and deletes by kid+game", async () => {
    await cache.writePendingAutosave("k1", "g1", { payloadEnc: "one" });
    vi.advanceTimersByTime(1000);
    await cache.writePendingAutosave("k1", "g2", { payloadEnc: "two" });

    expect(await cache.readPendingAutosave("k1", "g1")).toEqual({
      payloadEnc: "one",
    });
    expect(await cache.readPendingAutosaves()).toEqual([
      { payloadEnc: "one" },
      { payloadEnc: "two" },
    ]);

    await cache.deletePendingAutosave("k1", "g1");
    expect(await cache.readPendingAutosave("k1", "g1")).toBeNull();
    expect(await cache.readPendingAutosaves()).toEqual([{ payloadEnc: "two" }]);
  });

  it("clearAll wipes every store", async () => {
    await cache.writeGameRows("kid-1", [{ id: "g1" }]);
    await cache.writeSnapshotPayload("s1", { id: "s1" }, 1);
    await cache.writePendingAutosave("k1", "g1", { payloadEnc: "one" });

    await cache.clearAll();

    expect(await cache.readGameRows("kid-1")).toBeNull();
    expect(await cache.readSnapshotPayload("s1")).toBeNull();
    expect(await cache.readPendingAutosaves()).toEqual([]);
  });

  it("degrades to a no-op without a backend (SSR/private mode)", async () => {
    const nullCache = createOfflineCache(null);
    await expect(nullCache.writeGameRows("k", [])).resolves.toBeUndefined();
    expect(await nullCache.readGameRows("k")).toBeNull();
    expect(await nullCache.readPendingAutosaves()).toEqual([]);
    expect(await nullCache.cachedSnapshotPayloadIds()).toEqual(new Set());
    await expect(nullCache.clearAll()).resolves.toBeUndefined();
  });
});

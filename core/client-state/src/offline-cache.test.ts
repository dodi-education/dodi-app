import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createInMemoryOfflineBackend,
  createOfflineCache,
  type DeviceOfflineCache,
  type OfflineCacheBackend,
  type OfflineSecretSlot,
} from "./offline-cache";

function memorySlot(): OfflineSecretSlot & { value: string | null } {
  const slot = {
    value: null as string | null,
    read: async () => slot.value,
    write: async (value: string) => {
      slot.value = value;
    },
    clear: async () => {
      slot.value = null;
    },
  };
  return slot;
}

describe("offline cache", () => {
  let backend: OfflineCacheBackend;
  let slot: ReturnType<typeof memorySlot>;
  let cache: DeviceOfflineCache;

  beforeEach(() => {
    backend = createInMemoryOfflineBackend();
    slot = memorySlot();
    cache = createOfflineCache({ backend, vaultKeys: slot });
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
    expect(await cache.readSnapshotList("kid-2")).toBeNull();
  });

  it("stores rows verbatim under the shared cache keys", async () => {
    await cache.writeGameRows("kid-1", [{ id: "g1" }]);
    await cache.writeKidRows([{ id: "kid-1" }]);
    await cache.writeSnapshotList("kid-1", [{ id: "s1" }]);
    await cache.writeAutosave("kid-1", "g1", { id: "a1" });

    expect(await backend.get("kv", "games:kid-1")).toEqual([{ id: "g1" }]);
    expect(await backend.get("kv", "kids")).toEqual([{ id: "kid-1" }]);
    expect(await backend.get("kv", "snapshots:kid-1")).toEqual([{ id: "s1" }]);
    expect(await backend.get("kv", "autosave:kid-1:g1")).toEqual({ id: "a1" });
  });

  it("keeps the vault keys in the sealed slot, never the plain backend", async () => {
    const keys = { v: 1, deviceWraps: [{ deviceId: "d1", wrap: "..." }] };
    await cache.writeVaultKeys(keys);

    expect(await cache.readVaultKeys()).toEqual(keys);
    expect(slot.value).toBe(JSON.stringify(keys));
    for (const store of ["kv", "snapshot_payloads", "pending_autosaves"] as const) {
      expect(await backend.entries(store)).toEqual([]);
    }
  });

  it("caches no vault keys without a sealed slot", async () => {
    const unsealed = createOfflineCache({ backend, vaultKeys: null });
    await unsealed.writeVaultKeys({ v: 1 });
    expect(await unsealed.readVaultKeys()).toBeNull();
    expect(await backend.entries("kv")).toEqual([]);
  });

  it("reads a corrupt vault-keys record as a miss", async () => {
    slot.value = "{not json";
    expect(await cache.readVaultKeys()).toBeNull();
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

  it("budgets payloads a previous run cached, reading them only once", async () => {
    const six = 6 * 1024 * 1024;
    await cache.writeSnapshotPayload("old", { id: "old" }, six);
    vi.advanceTimersByTime(1000);
    await cache.writeSnapshotPayload("mid", { id: "mid" }, six);
    vi.advanceTimersByTime(1000);

    // A fresh instance over the same storage (app restart).
    const entries = vi.spyOn(backend, "entries");
    const restarted = createOfflineCache({ backend, vaultKeys: slot });
    expect(await restarted.cachedSnapshotPayloadIds()).toEqual(new Set(["old", "mid"]));
    await restarted.writeSnapshotPayload("new", { id: "new" }, six);
    await restarted.writeSnapshotPayload("newer", { id: "newer" }, 1);

    expect(await restarted.readSnapshotPayload("old")).toBeNull();
    expect(await restarted.cachedSnapshotPayloadIds()).toEqual(new Set(["mid", "new", "newer"]));
    expect(entries.mock.calls.filter(([store]) => store === "snapshot_payloads")).toHaveLength(1);
  });

  it("orders pending autosaves oldest-first and deletes by kid+game", async () => {
    await cache.writePendingAutosave("k1", "g1", { payloadEnc: "one" });
    vi.advanceTimersByTime(1000);
    await cache.writePendingAutosave("k1", "g2", { payloadEnc: "two" });

    expect(await cache.readPendingAutosave("k1", "g1")).toEqual({ payloadEnc: "one" });
    expect(await cache.readPendingAutosaves()).toEqual([{ payloadEnc: "one" }, { payloadEnc: "two" }]);

    await cache.deletePendingAutosave("k1", "g1");
    expect(await cache.readPendingAutosave("k1", "g1")).toBeNull();
    expect(await cache.readPendingAutosaves()).toEqual([{ payloadEnc: "two" }]);
  });

  it("an overwritten pending autosave moves to the back of the queue", async () => {
    await cache.writePendingAutosave("k1", "g1", { payloadEnc: "one" });
    vi.advanceTimersByTime(1000);
    await cache.writePendingAutosave("k1", "g2", { payloadEnc: "two" });
    vi.advanceTimersByTime(1000);
    await cache.writePendingAutosave("k1", "g1", { payloadEnc: "one-later" });

    expect(await cache.readPendingAutosaves()).toEqual([{ payloadEnc: "two" }, { payloadEnc: "one-later" }]);
  });

  it("clearAll wipes every store and the vault keys", async () => {
    await cache.writeVaultKeys({ v: 1 });
    await cache.writeGameRows("kid-1", [{ id: "g1" }]);
    await cache.writeSnapshotPayload("s1", { id: "s1" }, 1);
    await cache.writePendingAutosave("k1", "g1", { payloadEnc: "one" });

    await cache.clearAll();

    expect(await cache.readVaultKeys()).toBeNull();
    expect(slot.value).toBeNull();
    expect(await cache.readGameRows("kid-1")).toBeNull();
    expect(await cache.readSnapshotPayload("s1")).toBeNull();
    expect(await cache.cachedSnapshotPayloadIds()).toEqual(new Set());
    expect(await cache.readPendingAutosaves()).toEqual([]);
  });

  it("never throws when the backend fails", async () => {
    const failing: OfflineCacheBackend = {
      get: () => Promise.reject(new Error("io")),
      put: () => Promise.reject(new Error("quota")),
      delete: () => Promise.reject(new Error("io")),
      entries: () => Promise.reject(new Error("io")),
      clearAll: () => Promise.reject(new Error("io")),
    };
    const brokenSlot: OfflineSecretSlot = {
      read: () => Promise.reject(new Error("keystore")),
      write: () => Promise.reject(new Error("keystore")),
      clear: () => Promise.reject(new Error("keystore")),
    };
    const broken = createOfflineCache({ backend: failing, vaultKeys: brokenSlot });

    await expect(broken.writeVaultKeys({ v: 1 })).resolves.toBeUndefined();
    expect(await broken.readVaultKeys()).toBeNull();
    await expect(broken.writeGameRows("k", [])).resolves.toBeUndefined();
    expect(await broken.readGameRows("k")).toBeNull();
    await expect(broken.writeSnapshotPayload("s", {}, 1)).resolves.toBeUndefined();
    expect(await broken.cachedSnapshotPayloadIds()).toEqual(new Set());
    await expect(broken.writePendingAutosave("k", "g", {})).resolves.toBeUndefined();
    expect(await broken.readPendingAutosaves()).toEqual([]);
    await expect(broken.deletePendingAutosave("k", "g")).resolves.toBeUndefined();
    await expect(broken.clearAll()).resolves.toBeUndefined();
  });

  it("degrades to a no-op without a backend (SSR / no storage)", async () => {
    const nullCache = createOfflineCache({ backend: null, vaultKeys: null });
    await expect(nullCache.writeGameRows("k", [])).resolves.toBeUndefined();
    expect(await nullCache.readGameRows("k")).toBeNull();
    expect(await nullCache.readPendingAutosaves()).toEqual([]);
    expect(await nullCache.cachedSnapshotPayloadIds()).toEqual(new Set());
    await expect(nullCache.clearAll()).resolves.toBeUndefined();
  });
});

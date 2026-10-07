import { beforeEach, describe, expect, it, vi } from "vitest";
import { createOfflineCache } from "@dodi/client-state/offline-cache";

import { INLINE_VALUE_MAX_CHARS, createNativeOfflineBackend, offlineCache } from "./offline-cache";
import { sealedSlot } from "./sealed-storage";

/**
 * The app's offline cache on device storage: the behaviour the shared cache
 * (`@dodi/client-state/offline-cache`) expects from a backend, plus what the
 * app adds: big values in files, persistence across a restart, and the vault
 * keys sealed outside the cache database. SQLite is real (node:sqlite behind
 * the expo-sqlite API); the file system, SecureStore and the key-value store
 * are in-memory stand-ins that outlive a "restart" (a new backend instance).
 */
const device = vi.hoisted(() => ({
  files: new Map<string, string>(),
  dirs: new Set<string>(),
  secure: new Map<string, string>(),
  kv: new Map<string, string>(),
  databases: new Map<string, unknown>(),
}));

type Params = (string | number | null)[];

/** The slice of node:sqlite's DatabaseSync the stand-in uses (no node types here). */
interface NodeSqlite {
  exec(sql: string): void;
  prepare(sql: string): { run(...p: Params): unknown; get(...p: Params): unknown; all(...p: Params): unknown[] };
}

vi.mock("expo-sqlite", async () => {
  const specifier = "node:sqlite";
  const { DatabaseSync } = (await import(/* @vite-ignore */ specifier)) as {
    DatabaseSync: new (path: string) => NodeSqlite;
  };
  function open(name: string) {
    let db = device.databases.get(name) as NodeSqlite | undefined;
    if (!db) {
      db = new DatabaseSync(":memory:");
      device.databases.set(name, db);
    }
    const sqlite = db;
    return {
      execAsync: async (sql: string) => sqlite.exec(sql),
      runAsync: async (sql: string, params: Params = []) => sqlite.prepare(sql).run(...params),
      getFirstAsync: async (sql: string, params: Params = []) => sqlite.prepare(sql).get(...params) ?? null,
      getAllAsync: async (sql: string, params: Params = []) => sqlite.prepare(sql).all(...params),
    };
  }
  return { openDatabaseAsync: async (name: string) => open(name) };
});

vi.mock("expo-file-system", () => {
  class Directory {
    readonly uri: string;
    constructor(parent: string | Directory, name: string) {
      this.uri = `${typeof parent === "string" ? parent : parent.uri}/${name}`;
    }
    get exists(): boolean {
      return device.dirs.has(this.uri);
    }
    create(): void {
      device.dirs.add(this.uri);
    }
    delete(): void {
      device.dirs.delete(this.uri);
      for (const path of [...device.files.keys()]) {
        if (path.startsWith(`${this.uri}/`)) device.files.delete(path);
      }
    }
    list(): File[] {
      return [...device.files.keys()]
        .filter((path) => path.startsWith(`${this.uri}/`))
        .map((path) => new File(this, path.slice(this.uri.length + 1)));
    }
  }
  class File {
    readonly uri: string;
    readonly name: string;
    constructor(dir: Directory, name: string) {
      if (!dir.exists) throw new Error(`no directory ${dir.uri}`);
      this.uri = `${dir.uri}/${name}`;
      this.name = name;
    }
    get exists(): boolean {
      return device.files.has(this.uri);
    }
    create(): void {
      device.files.set(this.uri, "");
    }
    write(content: string): void {
      device.files.set(this.uri, content);
    }
    async text(): Promise<string> {
      const content = device.files.get(this.uri);
      if (content === undefined) throw new Error("missing file");
      return content;
    }
    delete(): void {
      device.files.delete(this.uri);
    }
  }
  return { Directory, File, Paths: { document: "file:///documents" } };
});

vi.mock("expo-crypto", () => ({ randomUUID: () => crypto.randomUUID() }));

vi.mock("expo-secure-store", () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 1,
  getItemAsync: async (key: string) => device.secure.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    device.secure.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    device.secure.delete(key);
  },
}));

vi.mock("expo-sqlite/kv-store", () => ({
  Storage: {
    getItemSync: (key: string) => device.kv.get(key) ?? null,
    setItemSync: (key: string, value: string) => {
      device.kv.set(key, value);
    },
    removeItemSync: (key: string) => {
      device.kv.delete(key);
    },
  },
}));


const BLOB_DIR = "file:///documents/offline-cache";

function blobPaths(): string[] {
  return [...device.files.keys()].filter((path) => path.startsWith(`${BLOB_DIR}/`));
}

/** A sealed game bundle well past the inline limit. */
function bigRows(id: string): { id: string; code_bundle: string }[] {
  return [{ id, code_bundle: `enc:v1:${"x".repeat(INLINE_VALUE_MAX_CHARS)}` }];
}

beforeEach(async () => {
  await offlineCache.clearAll();
  device.files.clear();
  device.dirs.clear();
  device.secure.clear();
  device.kv.clear();
});

describe("native offline backend", () => {
  it("keeps small values in the row and big ones in a file", async () => {
    const backend = createNativeOfflineBackend();
    await backend.put("kv", "kids", [{ id: "kid-1", name: "enc:v1:a:b:c" }]);
    await backend.put("kv", "games:kid-1", bigRows("g1"));

    expect(await backend.get("kv", "kids")).toEqual([{ id: "kid-1", name: "enc:v1:a:b:c" }]);
    expect(await backend.get("kv", "games:kid-1")).toEqual(bigRows("g1"));
    expect(blobPaths()).toHaveLength(1);
    expect(device.files.get(blobPaths()[0])).toBe(JSON.stringify(bigRows("g1")));
  });

  it("reads a missing key as undefined", async () => {
    const backend = createNativeOfflineBackend();
    expect(await backend.get("kv", "kids")).toBeUndefined();
  });

  it("scopes keys per store and lists a store's entries", async () => {
    const backend = createNativeOfflineBackend();
    await backend.put("pending_autosaves", "autosave:k1:g1", { input: 1, updatedAt: 1 });
    await backend.put("snapshot_payloads", "autosave:k1:g1", { detail: 2, payloadBytes: 1, cachedAt: 1 });
    await backend.put("snapshot_payloads", "s2", { detail: bigRows("s2"), payloadBytes: 9, cachedAt: 2 });

    expect(await backend.entries("pending_autosaves")).toEqual([
      { key: "autosave:k1:g1", value: { input: 1, updatedAt: 1 } },
    ]);
    const payloads = await backend.entries("snapshot_payloads");
    expect(payloads.map((e) => e.key).sort()).toEqual(["autosave:k1:g1", "s2"]);
    expect(payloads.find((e) => e.key === "s2")?.value).toEqual({
      detail: bigRows("s2"),
      payloadBytes: 9,
      cachedAt: 2,
    });
  });

  it("drops the old file when a value is overwritten or deleted", async () => {
    const backend = createNativeOfflineBackend();
    await backend.put("kv", "games:kid-1", bigRows("g1"));
    const [first] = blobPaths();

    await backend.put("kv", "games:kid-1", bigRows("g2"));
    expect(blobPaths()).toHaveLength(1);
    expect(blobPaths()[0]).not.toBe(first);

    await backend.put("kv", "games:kid-1", [{ id: "small" }]);
    expect(blobPaths()).toEqual([]);
    expect(await backend.get("kv", "games:kid-1")).toEqual([{ id: "small" }]);

    await backend.put("kv", "games:kid-1", bigRows("g3"));
    await backend.delete("kv", "games:kid-1");
    expect(blobPaths()).toEqual([]);
    expect(await backend.get("kv", "games:kid-1")).toBeUndefined();
  });

  it("survives an app restart (a new backend over the same storage)", async () => {
    const before = createNativeOfflineBackend();
    await before.put("kv", "kids", [{ id: "kid-1" }]);
    await before.put("kv", "games:kid-1", bigRows("g1"));

    const after = createNativeOfflineBackend();
    expect(await after.get("kv", "kids")).toEqual([{ id: "kid-1" }]);
    expect(await after.get("kv", "games:kid-1")).toEqual(bigRows("g1"));
  });

  it("sweeps files no row points at when it opens", async () => {
    const backend = createNativeOfflineBackend();
    await backend.put("kv", "games:kid-1", bigRows("g1"));
    const [kept] = blobPaths();
    // A crash between writing a file and pointing the row at it.
    device.files.set(`${BLOB_DIR}/00000000-0000-4000-8000-000000000000.json`, "[]");

    const restarted = createNativeOfflineBackend();
    expect(await restarted.get("kv", "games:kid-1")).toEqual(bigRows("g1"));
    expect(blobPaths()).toEqual([kept]);
  });

  it("reads a row whose file went missing as a miss", async () => {
    const backend = createNativeOfflineBackend();
    await backend.put("kv", "games:kid-1", bigRows("g1"));
    device.files.delete(blobPaths()[0]);

    expect(await backend.get("kv", "games:kid-1")).toBeUndefined();
    expect(await backend.entries("kv")).toEqual([]);
  });

  it("serializes overlapping writes of one key (no stray files)", async () => {
    const backend = createNativeOfflineBackend();
    await Promise.all([
      backend.put("kv", "games:kid-1", bigRows("a")),
      backend.put("kv", "games:kid-1", bigRows("b")),
      backend.put("kv", "games:kid-1", bigRows("c")),
    ]);

    expect(blobPaths()).toHaveLength(1);
    expect(await backend.get("kv", "games:kid-1")).toEqual(bigRows("c"));
  });

  it("clearAll drops every row and file", async () => {
    const backend = createNativeOfflineBackend();
    await backend.put("kv", "kids", [{ id: "kid-1" }]);
    await backend.put("snapshot_payloads", "s1", { detail: bigRows("s1"), payloadBytes: 1, cachedAt: 1 });
    await backend.put("pending_autosaves", "autosave:k1:g1", { input: bigRows("p"), updatedAt: 1 });

    await backend.clearAll();

    expect(await backend.get("kv", "kids")).toBeUndefined();
    expect(await backend.entries("snapshot_payloads")).toEqual([]);
    expect(await backend.entries("pending_autosaves")).toEqual([]);
    expect(blobPaths()).toEqual([]);
    // Usable again afterwards.
    await backend.put("kv", "games:kid-1", bigRows("g1"));
    expect(await backend.get("kv", "games:kid-1")).toEqual(bigRows("g1"));
  });
});

describe("the app's offline cache", () => {
  const keys = { v: 1, deviceWraps: [{ deviceId: "device-1", wrap: "wrapped-vmk" }] };

  it("seals the vault keys outside the cache database", async () => {
    await offlineCache.writeVaultKeys(keys);

    expect(await offlineCache.readVaultKeys()).toEqual(keys);
    // At rest: a SecureStore key, and only ciphertext in app storage.
    expect(device.secure.size).toBe(1);
    const atRest = [...device.kv.values(), ...device.files.values()].join("\n");
    expect(atRest).not.toContain("deviceWraps");
    expect(atRest).not.toContain("device-1");
    expect(await createNativeOfflineBackend().entries("kv")).toEqual([]);
  });

  it("opens nothing from the app storage alone (the keystore key is gone)", async () => {
    await offlineCache.writeVaultKeys(keys);
    device.secure.clear();

    expect(await offlineCache.readVaultKeys()).toBeNull();
  });

  it("keeps parked autosaves across a restart, oldest first", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-06T10:00:00Z"));
    try {
      await offlineCache.writePendingAutosave("kid-1", "g1", { payloadEnc: `enc:v1:${"a".repeat(INLINE_VALUE_MAX_CHARS)}` });
      vi.advanceTimersByTime(1000);
      await offlineCache.writePendingAutosave("kid-1", "g2", { payloadEnc: "enc:v1:b" });
    } finally {
      vi.useRealTimers();
    }

    const restarted = createOfflineCache({
      backend: createNativeOfflineBackend(),
      vaultKeys: sealedSlot("offline-vault-keys"),
    });
    const pending = await restarted.readPendingAutosaves<{ payloadEnc: string }>();
    expect(pending.map((p) => p.payloadEnc.slice(0, 8))).toEqual(["enc:v1:a", "enc:v1:b"]);
  });

  it("serves rows and snapshot payloads after a restart", async () => {
    await offlineCache.writeKidRows([{ id: "kid-1" }]);
    await offlineCache.writeGameRows("kid-1", bigRows("g1"));
    await offlineCache.writeSnapshotList("kid-1", [{ id: "s1" }]);
    await offlineCache.writeSnapshotPayload("s1", { id: "s1", payloadEnc: "enc:v1:p" }, 10);
    await offlineCache.writeVaultKeys(keys);

    const restarted = createOfflineCache({
      backend: createNativeOfflineBackend(),
      vaultKeys: sealedSlot("offline-vault-keys"),
    });
    expect(await restarted.readKidRows()).toEqual([{ id: "kid-1" }]);
    expect(await restarted.readGameRows("kid-1")).toEqual(bigRows("g1"));
    expect(await restarted.readSnapshotList("kid-1")).toEqual([{ id: "s1" }]);
    expect(await restarted.readSnapshotPayload("s1")).toEqual({ id: "s1", payloadEnc: "enc:v1:p" });
    expect(await restarted.cachedSnapshotPayloadIds()).toEqual(new Set(["s1"]));
    expect(await restarted.readVaultKeys()).toEqual(keys);
  });

  it("clearAll (sign-out) wipes rows, files and the sealed vault keys", async () => {
    await offlineCache.writeVaultKeys(keys);
    await offlineCache.writeGameRows("kid-1", bigRows("g1"));
    await offlineCache.writePendingAutosave("kid-1", "g1", { payloadEnc: "enc:v1:x" });

    await offlineCache.clearAll();

    expect(await offlineCache.readVaultKeys()).toBeNull();
    expect(await offlineCache.readGameRows("kid-1")).toBeNull();
    expect(await offlineCache.readPendingAutosaves()).toEqual([]);
    expect(blobPaths()).toEqual([]);
    expect(device.secure.size).toBe(0);
    expect([...device.kv.keys()].filter((key) => key.includes("offline"))).toEqual([]);
  });
});

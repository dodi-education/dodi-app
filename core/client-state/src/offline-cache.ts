/**
 * The device's offline cache for the kid view, shared by the web and the app.
 * Each client supplies a keyed-store backend (web: IndexedDB; app: SQLite with
 * big values in files) and a sealed slot for the vault keys; the cache keys,
 * the snapshot-payload budget (LRU) and the pending-autosave ordering live
 * here once.
 *
 * What it stores:
 *  - `kv`: kid rows, per-kid game rows, per-kid snapshot lists and fetched
 *    autosave slots, exactly as the platform returned them, i.e. as `enc:v1:` /
 *    SealedEnvelope CIPHERTEXT. Plaintext system-game rows land here too (they
 *    are public). Decrypted plaintext is NEVER written.
 *  - `snapshot_payloads`: full snapshot details for offline replay, LRU within
 *    a byte and item budget.
 *  - `pending_autosaves`: sealed autosave uploads that failed offline, flushed
 *    on reconnect.
 *  - the vault keys (`StoredVaultKeys`): through the platform's sealed slot,
 *    never the plain backend. They are normally only held server-side behind
 *    auth; next to the device key they would derive the VMK, so at rest they
 *    are sealed under a key the storage alone doesn't hold (web: a
 *    non-extractable AES-GCM key; app: a SecureStore key).
 *
 * Every operation is best-effort: reads resolve null and writes resolve void on
 * any failure, so offline support never breaks the online path.
 */
import type { OfflineCache } from "./platform";
import type { SnapshotOfflineCache } from "./snapshots";

export const OFFLINE_STORES = ["kv", "snapshot_payloads", "pending_autosaves"] as const;

export type OfflineStoreName = (typeof OFFLINE_STORES)[number];

/** Byte budget for offline snapshot payloads (oldest evicted beyond it). */
export const MAX_SNAPSHOT_PAYLOAD_BYTES = 15 * 1024 * 1024;
/** Item cap for offline snapshot payloads. */
export const MAX_SNAPSHOT_PAYLOAD_ITEMS = 20;

/** A minimal keyed store per {@link OfflineStoreName}; values are JSON-safe. */
export interface OfflineCacheBackend {
  get(store: OfflineStoreName, key: string): Promise<unknown>;
  put(store: OfflineStoreName, key: string, value: unknown): Promise<void>;
  delete(store: OfflineStoreName, key: string): Promise<void>;
  entries(store: OfflineStoreName): Promise<Array<{ key: string; value: unknown }>>;
  clearAll(): Promise<void>;
}

/** One sealed device-local record (the vault keys, as JSON). */
export interface OfflineSecretSlot {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  clear(): Promise<void>;
}

/** The full device cache: the stores' port, the snapshots' port, and the wipe. */
export interface DeviceOfflineCache extends OfflineCache, SnapshotOfflineCache {
  /** Full wipe (sign-out): every store and the sealed vault keys. */
  clearAll(): Promise<void>;
}

export interface OfflineCacheDeps {
  /** Null where the platform has no storage (SSR): everything no-ops. */
  backend: OfflineCacheBackend | null;
  /** Null where the platform can't seal: vault keys are never cached. */
  vaultKeys: OfflineSecretSlot | null;
}

interface SnapshotPayloadRecord {
  detail: unknown;
  payloadBytes: number;
  cachedAt: number;
}

interface PendingAutosaveRecord {
  input: unknown;
  updatedAt: number;
}

interface PayloadMeta {
  payloadBytes: number;
  cachedAt: number;
}

export function createInMemoryOfflineBackend(): OfflineCacheBackend {
  const stores = new Map<OfflineStoreName, Map<string, unknown>>(
    OFFLINE_STORES.map((name) => [name, new Map()]),
  );
  const of = (name: OfflineStoreName): Map<string, unknown> => stores.get(name)!;
  return {
    get: (store, key) => Promise.resolve(of(store).get(key)),
    put: (store, key, value) => {
      of(store).set(key, value);
      return Promise.resolve();
    },
    delete: (store, key) => {
      of(store).delete(key);
      return Promise.resolve();
    },
    entries: (store) => Promise.resolve(Array.from(of(store), ([key, value]) => ({ key, value }))),
    clearAll: () => {
      for (const store of stores.values()) store.clear();
      return Promise.resolve();
    },
  };
}

// --- Cache keys -------------------------------------------------------------

const KIDS_KEY = "kids";

function gamesKey(kidId: string): string {
  return `games:${kidId}`;
}

function snapshotsKey(kidId: string): string {
  return `snapshots:${kidId}`;
}

function autosaveKey(kidId: string, gameId: string): string {
  return `autosave:${kidId}:${gameId}`;
}

function isPayloadRecord(value: unknown): value is SnapshotPayloadRecord {
  return typeof value === "object" && value !== null && "payloadBytes" in value && "cachedAt" in value;
}

export function createOfflineCache({ backend, vaultKeys }: OfflineCacheDeps): DeviceOfflineCache {
  async function read<T>(store: OfflineStoreName, key: string): Promise<T | null> {
    if (!backend) return null;
    try {
      return ((await backend.get(store, key)) as T | undefined) ?? null;
    } catch {
      return null;
    }
  }

  async function write(store: OfflineStoreName, key: string, value: unknown): Promise<boolean> {
    if (!backend) return false;
    try {
      await backend.put(store, key, value);
      return true;
    } catch {
      // Quota / storage failures are acceptable: the cache stays cold.
      return false;
    }
  }

  // The snapshot payloads' sizes and ages, read from the backend once and then
  // kept in step with this instance's writes, so the budget and the prefetch's
  // skip set never load every (multi-MB) payload again. Another browser tab's
  // writes show up after a reload; the budget is opportunistic either way.
  let payloadIndex: Promise<Map<string, PayloadMeta>> | null = null;

  function loadPayloadIndex(): Promise<Map<string, PayloadMeta>> {
    if (!backend) return Promise.resolve(new Map());
    payloadIndex ??= backend.entries("snapshot_payloads").then(
      (entries) =>
        new Map(
          entries.map(({ key, value }) => [
            key,
            isPayloadRecord(value)
              ? { payloadBytes: value.payloadBytes, cachedAt: value.cachedAt }
              : { payloadBytes: 0, cachedAt: 0 },
          ]),
        ),
      (error: unknown) => {
        payloadIndex = null;
        throw error;
      },
    );
    return payloadIndex;
  }

  async function enforceSnapshotBudget(index: Map<string, PayloadMeta>): Promise<void> {
    if (!backend) return;
    const newestFirst = [...index].sort(([, a], [, b]) => b.cachedAt - a.cachedAt);
    let bytes = 0;
    let kept = 0;
    for (const [key, meta] of newestFirst) {
      bytes += meta.payloadBytes;
      kept += 1;
      if (bytes > MAX_SNAPSHOT_PAYLOAD_BYTES || kept > MAX_SNAPSHOT_PAYLOAD_ITEMS) {
        await backend.delete("snapshot_payloads", key);
        index.delete(key);
      }
    }
  }

  return {
    async writeVaultKeys(keys) {
      if (!vaultKeys) return;
      try {
        await vaultKeys.write(JSON.stringify(keys));
      } catch {
        // Best-effort: the next online unlock writes it again.
      }
    },
    async readVaultKeys<T>() {
      if (!vaultKeys) return null;
      try {
        const raw = await vaultKeys.read();
        return raw ? (JSON.parse(raw) as T) : null;
      } catch {
        return null;
      }
    },

    writeKidRows: async (rows) => {
      await write("kv", KIDS_KEY, rows);
    },
    readKidRows: <T>() => read<T[]>("kv", KIDS_KEY),

    writeGameRows: async (kidId, rows) => {
      await write("kv", gamesKey(kidId), rows);
    },
    readGameRows: <T>(kidId: string) => read<T[]>("kv", gamesKey(kidId)),

    writeSnapshotList: async (kidId, views) => {
      await write("kv", snapshotsKey(kidId), views);
    },
    readSnapshotList: <T>(kidId: string) => read<T[]>("kv", snapshotsKey(kidId)),

    async writeSnapshotPayload(id, detail, payloadBytes) {
      const cachedAt = Date.now();
      const record: SnapshotPayloadRecord = { detail, payloadBytes, cachedAt };
      if (!(await write("snapshot_payloads", id, record))) return;
      try {
        const index = await loadPayloadIndex();
        index.set(id, { payloadBytes, cachedAt });
        await enforceSnapshotBudget(index);
      } catch {
        // Budget enforcement is opportunistic.
      }
    },
    async readSnapshotPayload<T>(id: string) {
      const record = await read<SnapshotPayloadRecord>("snapshot_payloads", id);
      return (record?.detail as T | undefined) ?? null;
    },
    async cachedSnapshotPayloadIds() {
      try {
        return new Set((await loadPayloadIndex()).keys());
      } catch {
        return new Set<string>();
      }
    },

    writeAutosave: async (kidId, gameId, detail) => {
      await write("kv", autosaveKey(kidId, gameId), detail);
    },
    readAutosave: <T>(kidId: string, gameId: string) => read<T>("kv", autosaveKey(kidId, gameId)),

    async writePendingAutosave(kidId, gameId, input) {
      const record: PendingAutosaveRecord = { input, updatedAt: Date.now() };
      await write("pending_autosaves", autosaveKey(kidId, gameId), record);
    },
    async readPendingAutosave<T>(kidId: string, gameId: string) {
      const record = await read<PendingAutosaveRecord>("pending_autosaves", autosaveKey(kidId, gameId));
      return (record?.input as T | undefined) ?? null;
    },
    async readPendingAutosaves<T>() {
      if (!backend) return [];
      try {
        const entries = (await backend.entries("pending_autosaves")) as Array<{
          key: string;
          value: PendingAutosaveRecord;
        }>;
        return entries
          .sort((a, b) => a.value.updatedAt - b.value.updatedAt)
          .map((e) => e.value.input as T);
      } catch {
        return [];
      }
    },
    async deletePendingAutosave(kidId, gameId) {
      if (!backend) return;
      try {
        await backend.delete("pending_autosaves", autosaveKey(kidId, gameId));
      } catch {
        // Best-effort.
      }
    },

    async clearAll() {
      payloadIndex = Promise.resolve(new Map());
      try {
        await backend?.clearAll();
      } catch {
        // Best-effort; the index rebuilds from the backend next time.
        payloadIndex = null;
      }
      try {
        await vaultKeys?.clear();
      } catch {
        // Best-effort.
      }
    },
  };
}

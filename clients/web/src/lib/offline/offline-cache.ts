/**
 * Offline cache — IndexedDB persistence for the kid view's offline mode.
 *
 * What it stores (DB `dodi-offline`):
 *  - `kv`: the wrapped vault keys (SEALED — see below), kid rows, per-kid game
 *    rows, per-kid snapshot lists, and fetched autosave slots. Game/kid/
 *    snapshot rows are stored exactly as the platform returned them — i.e. as
 *    `enc:v1:`/SealedEnvelope CIPHERTEXT. Plaintext system-game rows land here
 *    too, which is equivalent exposure to the browser HTTP cache. Decrypted
 *    plaintext is NEVER written.
 *  - `snapshot_payloads`: full snapshot details for offline replay, byte-
 *    budgeted LRU.
 *  - `pending_autosaves`: autosave uploads that failed offline, flushed on
 *    reconnect.
 *
 * Vault-keys sealing: the `StoredVaultKeys` blob is today only ever held
 * server-side behind auth; caching it verbatim would make an IndexedDB dump
 * alone sufficient to derive the VMK (the device KEM secret key already lives
 * unencrypted in the `dodi-vault` DB). So the cached copy is sealed under a
 * per-record NON-EXTRACTABLE AES-GCM key (multi-use variant of
 * `lib/sealed-secret.ts`) — an at-rest storage dump yields only ciphertext.
 *
 * Every operation is best-effort: failures resolve to null/void — offline
 * support must never break the online path.
 */

const DB_NAME = "dodi-offline";
const DB_VERSION = 1;

const KV_STORE = "kv";
const SNAPSHOT_PAYLOADS_STORE = "snapshot_payloads";
const PENDING_AUTOSAVES_STORE = "pending_autosaves";
const ALL_STORES = [
  KV_STORE,
  SNAPSHOT_PAYLOADS_STORE,
  PENDING_AUTOSAVES_STORE,
] as const;

export type OfflineStoreName = (typeof ALL_STORES)[number];

const VAULT_KEYS_RECORD = "vault-keys";

/** Byte/item budget for offline snapshot payloads (LRU beyond this). */
const MAX_SNAPSHOT_PAYLOAD_BYTES = 15 * 1024 * 1024;
const MAX_SNAPSHOT_PAYLOAD_ITEMS = 20;

interface SealedRecord {
  /** Non-extractable AES-GCM key — usable in-page, impossible to export. */
  key: CryptoKey;
  iv: Uint8Array<ArrayBuffer>;
  ciphertext: ArrayBuffer;
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

// ---------------------------------------------------------------------------
// Backend: a minimal keyed-store interface so the cache logic runs under the
// node test env (in-memory) and the browser (IndexedDB) unchanged.
// ---------------------------------------------------------------------------

export interface OfflineCacheBackend {
  get(store: OfflineStoreName, key: string): Promise<unknown>;
  put(store: OfflineStoreName, key: string, value: unknown): Promise<void>;
  delete(store: OfflineStoreName, key: string): Promise<void>;
  entries(
    store: OfflineStoreName,
  ): Promise<Array<{ key: string; value: unknown }>>;
  clearAll(): Promise<void>;
}

export function createInMemoryOfflineBackend(): OfflineCacheBackend {
  const stores = new Map<OfflineStoreName, Map<string, unknown>>(
    ALL_STORES.map((name) => [name, new Map()]),
  );
  const of = (name: OfflineStoreName) => stores.get(name)!;
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
    entries: (store) =>
      Promise.resolve(
        Array.from(of(store), ([key, value]) => ({ key, value })),
      ),
    clearAll: () => {
      for (const store of stores.values()) store.clear();
      return Promise.resolve();
    },
  };
}

// --- IndexedDB backend (browser). `indexedDB` is referenced lazily so the ---
// --- module stays import-safe under Node/SSR (sealed-secret conventions). ---

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      for (const store of ALL_STORES) {
        if (!req.result.objectStoreNames.contains(store)) {
          req.result.createObjectStore(store);
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error);
  });
}

function createIndexedDbOfflineBackend(): OfflineCacheBackend {
  async function withDb<T>(run: (db: IDBDatabase) => Promise<T>): Promise<T> {
    const db = await openDb();
    try {
      return await run(db);
    } finally {
      db.close();
    }
  }
  return {
    get: (store, key) =>
      withDb(
        (db) =>
          new Promise((resolve, reject) => {
            const req = db
              .transaction(store, "readonly")
              .objectStore(store)
              .get(key);
            req.onsuccess = () => resolve(req.result as unknown);
            req.onerror = () => reject(req.error);
          }),
      ),
    put: (store, key, value) =>
      withDb((db) => {
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).put(value, key);
        return txDone(tx);
      }),
    delete: (store, key) =>
      withDb((db) => {
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).delete(key);
        return txDone(tx);
      }),
    entries: (store) =>
      withDb(
        (db) =>
          new Promise((resolve, reject) => {
            const objectStore = db
              .transaction(store, "readonly")
              .objectStore(store);
            const keysReq = objectStore.getAllKeys();
            const valuesReq = objectStore.getAll();
            valuesReq.onsuccess = () => {
              const keys = keysReq.result as string[];
              resolve(
                (valuesReq.result as unknown[]).map((value, i) => ({
                  key: keys[i],
                  value,
                })),
              );
            };
            valuesReq.onerror = () => reject(valuesReq.error);
          }),
      ),
    clearAll: () =>
      withDb((db) => {
        const tx = db.transaction([...ALL_STORES], "readwrite");
        for (const store of ALL_STORES) tx.objectStore(store).clear();
        return txDone(tx);
      }),
  };
}

function defaultBackend(): OfflineCacheBackend | null {
  return typeof indexedDB !== "undefined"
    ? createIndexedDbOfflineBackend()
    : null;
}

// ---------------------------------------------------------------------------
// Sealing (vault keys only)
// ---------------------------------------------------------------------------

function subtle(): SubtleCrypto | null {
  return typeof globalThis.crypto !== "undefined"
    ? globalThis.crypto.subtle
    : null;
}

async function seal(value: unknown): Promise<SealedRecord | null> {
  const s = subtle();
  if (!s) return null;
  const key = await s.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await s.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return { key, iv, ciphertext };
}

async function unseal<T>(record: SealedRecord): Promise<T | null> {
  const s = subtle();
  if (!s) return null;
  try {
    const plaintext = await s.decrypt(
      { name: "AES-GCM", iv: record.iv },
      record.key,
      record.ciphertext,
    );
    return JSON.parse(new TextDecoder().decode(plaintext)) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Domain API
// ---------------------------------------------------------------------------

function gamesKey(kidId: string): string {
  return `games:${kidId}`;
}

function snapshotsKey(kidId: string): string {
  return `snapshots:${kidId}`;
}

function autosaveKey(kidId: string, gameId: string): string {
  return `autosave:${kidId}:${gameId}`;
}

export interface OfflineCache {
  writeVaultKeys(keys: unknown): Promise<void>;
  readVaultKeys<T>(): Promise<T | null>;
  writeKidRows(rows: unknown[]): Promise<void>;
  readKidRows<T>(): Promise<T[] | null>;
  writeGameRows(kidId: string, rows: unknown[]): Promise<void>;
  readGameRows<T>(kidId: string): Promise<T[] | null>;
  writeSnapshotList(kidId: string, views: unknown[]): Promise<void>;
  readSnapshotList<T>(kidId: string): Promise<T[] | null>;
  writeSnapshotPayload(
    id: string,
    detail: unknown,
    payloadBytes: number,
  ): Promise<void>;
  readSnapshotPayload<T>(id: string): Promise<T | null>;
  /** Snapshot ids currently cached — lets the prefetch skip present ones. */
  cachedSnapshotPayloadIds(): Promise<Set<string>>;
  writeAutosave(kidId: string, gameId: string, detail: unknown): Promise<void>;
  readAutosave<T>(kidId: string, gameId: string): Promise<T | null>;
  writePendingAutosave(
    kidId: string,
    gameId: string,
    input: unknown,
  ): Promise<void>;
  readPendingAutosave<T>(kidId: string, gameId: string): Promise<T | null>;
  readPendingAutosaves<T>(): Promise<T[]>;
  deletePendingAutosave(kidId: string, gameId: string): Promise<void>;
  /** Full wipe (sign-out). */
  clearAll(): Promise<void>;
}

export function createOfflineCache(
  backend: OfflineCacheBackend | null,
): OfflineCache {
  // Best-effort wrappers: reads resolve null, writes resolve void, on ANY
  // failure (no backend, quota, tampering) — offline support never throws
  // into the online path.
  async function read<T>(store: OfflineStoreName, key: string): Promise<T | null> {
    if (!backend) return null;
    try {
      return ((await backend.get(store, key)) as T | undefined) ?? null;
    } catch {
      return null;
    }
  }

  async function write(
    store: OfflineStoreName,
    key: string,
    value: unknown,
  ): Promise<void> {
    if (!backend) return;
    try {
      await backend.put(store, key, value);
    } catch {
      // Quota/private-mode failures are acceptable — cache stays cold.
    }
  }

  async function enforceSnapshotBudget(): Promise<void> {
    if (!backend) return;
    try {
      const entries = (await backend.entries(SNAPSHOT_PAYLOADS_STORE)) as Array<{
        key: string;
        value: SnapshotPayloadRecord;
      }>;
      const newestFirst = entries.sort(
        (a, b) => b.value.cachedAt - a.value.cachedAt,
      );
      let bytes = 0;
      let kept = 0;
      for (const entry of newestFirst) {
        bytes += entry.value.payloadBytes;
        kept += 1;
        if (bytes > MAX_SNAPSHOT_PAYLOAD_BYTES || kept > MAX_SNAPSHOT_PAYLOAD_ITEMS) {
          await backend.delete(SNAPSHOT_PAYLOADS_STORE, entry.key);
        }
      }
    } catch {
      // Budget enforcement is opportunistic.
    }
  }

  return {
    async writeVaultKeys(keys) {
      const sealed = await seal(keys);
      if (sealed) await write(KV_STORE, VAULT_KEYS_RECORD, sealed);
    },
    async readVaultKeys<T>() {
      const record = await read<SealedRecord>(KV_STORE, VAULT_KEYS_RECORD);
      return record ? unseal<T>(record) : null;
    },

    writeKidRows: (rows) => write(KV_STORE, "kids", rows),
    readKidRows: <T,>() => read<T[]>(KV_STORE, "kids"),

    writeGameRows: (kidId, rows) => write(KV_STORE, gamesKey(kidId), rows),
    readGameRows: <T,>(kidId: string) => read<T[]>(KV_STORE, gamesKey(kidId)),

    writeSnapshotList: (kidId, views) =>
      write(KV_STORE, snapshotsKey(kidId), views),
    readSnapshotList: <T,>(kidId: string) =>
      read<T[]>(KV_STORE, snapshotsKey(kidId)),

    async writeSnapshotPayload(id, detail, payloadBytes) {
      const record: SnapshotPayloadRecord = {
        detail,
        payloadBytes,
        cachedAt: Date.now(),
      };
      await write(SNAPSHOT_PAYLOADS_STORE, id, record);
      await enforceSnapshotBudget();
    },
    async readSnapshotPayload<T>(id: string) {
      const record = await read<SnapshotPayloadRecord>(
        SNAPSHOT_PAYLOADS_STORE,
        id,
      );
      return (record?.detail as T | undefined) ?? null;
    },
    async cachedSnapshotPayloadIds() {
      if (!backend) return new Set();
      try {
        const entries = await backend.entries(SNAPSHOT_PAYLOADS_STORE);
        return new Set(entries.map((e) => e.key));
      } catch {
        return new Set();
      }
    },

    writeAutosave: (kidId, gameId, detail) =>
      write(KV_STORE, autosaveKey(kidId, gameId), detail),
    readAutosave: <T,>(kidId: string, gameId: string) =>
      read<T>(KV_STORE, autosaveKey(kidId, gameId)),

    writePendingAutosave(kidId, gameId, input) {
      const record: PendingAutosaveRecord = { input, updatedAt: Date.now() };
      return write(PENDING_AUTOSAVES_STORE, autosaveKey(kidId, gameId), record);
    },
    async readPendingAutosave<T>(kidId: string, gameId: string) {
      const record = await read<PendingAutosaveRecord>(
        PENDING_AUTOSAVES_STORE,
        autosaveKey(kidId, gameId),
      );
      return (record?.input as T | undefined) ?? null;
    },
    async readPendingAutosaves<T>() {
      if (!backend) return [];
      try {
        const entries = (await backend.entries(
          PENDING_AUTOSAVES_STORE,
        )) as Array<{ key: string; value: PendingAutosaveRecord }>;
        return entries
          .sort((a, b) => a.value.updatedAt - b.value.updatedAt)
          .map((e) => e.value.input as T);
      } catch {
        return [];
      }
    },
    deletePendingAutosave: async (kidId, gameId) => {
      if (!backend) return;
      try {
        await backend.delete(PENDING_AUTOSAVES_STORE, autosaveKey(kidId, gameId));
      } catch {
        // Best-effort.
      }
    },

    clearAll: async () => {
      if (!backend) return;
      try {
        await backend.clearAll();
      } catch {
        // Best-effort.
      }
    },
  };
}

/** The app-wide cache instance (no-op outside the browser). */
export const offlineCache: OfflineCache = createOfflineCache(defaultBackend());

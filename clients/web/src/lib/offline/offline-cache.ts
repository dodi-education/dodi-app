/**
 * Offline cache: the browser's backend for the shared device cache
 * (`@dodi/client-state/offline-cache`, which owns the cache keys, the snapshot
 * payload budget and the pending-autosave queue; see there for what is stored).
 *
 * Here: IndexedDB (DB `dodi-offline`: stores `kv`, `snapshot_payloads`,
 * `pending_autosaves`) and the sealing of the cached vault keys.
 *
 * Vault-keys sealing: the `StoredVaultKeys` blob is today only ever held
 * server-side behind auth; caching it verbatim would make an IndexedDB dump
 * alone sufficient to derive the VMK (the device KEM secret key already lives
 * unencrypted in the `dodi-vault` DB). So the cached copy is sealed under a
 * per-record NON-EXTRACTABLE AES-GCM key (multi-use variant of
 * `lib/sealed-secret.ts`) and kept in `kv` under `vault-keys`: an at-rest
 * storage dump yields only ciphertext.
 */
import {
  OFFLINE_STORES,
  createInMemoryOfflineBackend,
  createOfflineCache as createSharedOfflineCache,
  type DeviceOfflineCache,
  type OfflineCacheBackend,
  type OfflineSecretSlot,
  type OfflineStoreName,
} from "@dodi/client-state/offline-cache";

export {
  createInMemoryOfflineBackend,
  type OfflineCacheBackend,
  type OfflineStoreName,
};

/** The full device cache (stores' + snapshots' ports, and the sign-out wipe). */
export type OfflineCache = DeviceOfflineCache;

const DB_NAME = "dodi-offline";
const DB_VERSION = 1;

const VAULT_KEYS_RECORD = "vault-keys";

interface SealedRecord {
  /** Non-extractable AES-GCM key — usable in-page, impossible to export. */
  key: CryptoKey;
  iv: Uint8Array<ArrayBuffer>;
  ciphertext: ArrayBuffer;
}

// --- IndexedDB backend (browser). `indexedDB` is referenced lazily so the ---
// --- module stays import-safe under Node/SSR (sealed-secret conventions). ---

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      for (const store of OFFLINE_STORES) {
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
        const tx = db.transaction([...OFFLINE_STORES], "readwrite");
        for (const store of OFFLINE_STORES) tx.objectStore(store).clear();
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

async function seal(plaintext: string): Promise<SealedRecord | null> {
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
    new TextEncoder().encode(plaintext),
  );
  return { key, iv, ciphertext };
}

async function unseal(record: SealedRecord): Promise<string | null> {
  const s = subtle();
  if (!s) return null;
  try {
    const plaintext = await s.decrypt(
      { name: "AES-GCM", iv: record.iv },
      record.key,
      record.ciphertext,
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  }
}

/** The vault keys' slot: sealed records in the backend's `kv` store. */
function sealedVaultKeysSlot(backend: OfflineCacheBackend): OfflineSecretSlot {
  return {
    async read() {
      const record = (await backend.get("kv", VAULT_KEYS_RECORD)) as
        | SealedRecord
        | undefined;
      return record ? unseal(record) : null;
    },
    async write(value) {
      const sealed = await seal(value);
      if (sealed) await backend.put("kv", VAULT_KEYS_RECORD, sealed);
    },
    clear: () => backend.delete("kv", VAULT_KEYS_RECORD),
  };
}

/** The shared cache over a backend, with the sealed vault-keys slot in it. */
export function createOfflineCache(
  backend: OfflineCacheBackend | null,
): OfflineCache {
  return createSharedOfflineCache({
    backend,
    vaultKeys: backend ? sealedVaultKeysSlot(backend) : null,
  });
}

/** The app-wide cache instance (no-op outside the browser). */
export const offlineCache: OfflineCache = createOfflineCache(defaultBackend());

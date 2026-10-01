/**
 * Browser storage for Game Studio build checkpoints (`@dodi/studio`): one
 * vault-sealed record per game in IndexedDB, so a build that a reload or a
 * closed tab cut short can continue on this device. Records are sealed before
 * they get here and never leave the browser. `indexedDB` is referenced lazily
 * so this module is import-safe under Node/SSR (same pattern as sealed-secret).
 */

import type { CheckpointStore } from "@dodi/studio/ports";

const DB_NAME = "dodi-studio";
const STORE = "build-checkpoints";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
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

async function write(
  apply: (store: IDBObjectStore) => void,
): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    apply(tx.objectStore(STORE));
    await txDone(tx);
  } finally {
    db.close();
  }
}

function createIndexedDbCheckpointStore(): CheckpointStore {
  return {
    save: (gameId, sealed) => write((store) => store.put(sealed, gameId)),
    clear: (gameId) => write((store) => store.delete(gameId)),
    async load(gameId) {
      const db = await openDb();
      try {
        return await new Promise<string | null>((resolve, reject) => {
          const req = db
            .transaction(STORE, "readonly")
            .objectStore(STORE)
            .get(gameId);
          req.onsuccess = () =>
            resolve(typeof req.result === "string" ? req.result : null);
          req.onerror = () => reject(req.error);
        });
      } finally {
        db.close();
      }
    },
  };
}

/** The browser's checkpoint store; undefined where IndexedDB is unavailable. */
export function browserCheckpointStore(): CheckpointStore | undefined {
  return typeof indexedDB !== "undefined"
    ? createIndexedDbCheckpointStore()
    : undefined;
}

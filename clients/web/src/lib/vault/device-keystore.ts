/**
 * Device keystore — persists this device's post-quantum identity keypairs so
 * the browser can SILENTLY re-unlock the vault on reload (the device wrap of the
 * VMK is unwrapped with the device's ML-KEM secret key).
 *
 * Security note: the secret keys are stored in IndexedDB unencrypted — this is
 * the deliberate "trusted device / stay-unlocked" tradeoff (like staying logged
 * in). A future hardening can wrap them under a device PIN / passkey / WebAuthn
 * PRF before storage. Anyone with access to the unlocked browser profile can
 * unwrap the VMK, exactly as they could read an open session.
 */
import {
  type KemKeyPair,
  type SignKeyPair,
  generateKemKeyPair,
  generateSignKeyPair,
  randomBytes,
  toBase64Url,
} from "@dodi/crypto";

export interface StoredDevice {
  deviceId: string;
  kem: KemKeyPair;
  sign: SignKeyPair;
}

export interface DeviceKeystore {
  load(): Promise<StoredDevice | null>;
  save(device: StoredDevice): Promise<void>;
  clear(): Promise<void>;
}

/** Generate a fresh device identity (random id + ML-KEM + ML-DSA keypairs). */
export function createDevice(): StoredDevice {
  return {
    deviceId: toBase64Url(randomBytes(16)),
    kem: generateKemKeyPair(),
    sign: generateSignKeyPair(),
  };
}

/** Load the device, creating + persisting one on first use. */
export async function getOrCreateDevice(
  keystore: DeviceKeystore,
): Promise<StoredDevice> {
  const existing = await keystore.load();
  if (existing) return existing;
  const device = createDevice();
  await keystore.save(device);
  return device;
}

// ---------------------------------------------------------------------------
// In-memory keystore (tests / SSR fallback)
// ---------------------------------------------------------------------------

export function createInMemoryDeviceKeystore(): DeviceKeystore {
  let stored: StoredDevice | null = null;
  return {
    load: () => Promise.resolve(stored),
    save: (device) => {
      stored = device;
      return Promise.resolve();
    },
    clear: () => {
      stored = null;
      return Promise.resolve();
    },
  };
}

// ---------------------------------------------------------------------------
// IndexedDB keystore (browser). `indexedDB` is referenced lazily so this module
// is import-safe under Node/SSR.
// ---------------------------------------------------------------------------

const DB_NAME = "dodi-vault";
const STORE = "device";
const RECORD_KEY = "self";

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

export function createIndexedDbDeviceKeystore(): DeviceKeystore {
  return {
    async load() {
      const db = await openDb();
      try {
        return await new Promise<StoredDevice | null>((resolve, reject) => {
          const req = db
            .transaction(STORE, "readonly")
            .objectStore(STORE)
            .get(RECORD_KEY);
          req.onsuccess = () =>
            resolve((req.result as StoredDevice | undefined) ?? null);
          req.onerror = () => reject(req.error);
        });
      } finally {
        db.close();
      }
    },
    async save(device) {
      const db = await openDb();
      try {
        const tx = db.transaction(STORE, "readwrite");
        // Structured clone preserves the Uint8Array key material.
        tx.objectStore(STORE).put(device, RECORD_KEY);
        await txDone(tx);
      } finally {
        db.close();
      }
    },
    async clear() {
      const db = await openDb();
      try {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).delete(RECORD_KEY);
        await txDone(tx);
      } finally {
        db.close();
      }
    },
  };
}

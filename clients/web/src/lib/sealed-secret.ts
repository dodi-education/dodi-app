/**
 * Sealed secret — a single-slot, single-use, TTL-bounded store for one opaque
 * secret string that must survive briefly in the browser but must NOT sit around
 * in plaintext.
 *
 * Used by registration: after `signUp` (email confirmation pending) the client
 * builds the E2EE vault in memory and seals `{ storedKeys, nsec }` here, then
 * zeroes the password. When the user enters the emailed OTP code — in the SAME
 * tab — the sealed blob is consumed to persist the vault and reveal the nsec
 * account key, with no password re-entry. The caller owns JSON; this module
 * only deals in strings so it stays domain-free.
 *
 * Security posture: the secret is NEVER written in plaintext. It is sealed with a
 * per-browser, NON-EXTRACTABLE AES-GCM key held in IndexedDB — usable in-page but
 * impossible to export, so an at-rest storage dump (backup, sync, forensics)
 * yields only ciphertext. Single-use (wiped on read), TTL-bounded, and overwritten
 * by the next registration. Any miss — cleared storage, expiry, tampering —
 * resolves to `null` and the caller falls back (e.g. the manual /finish-setup
 * form). Nothing here ever touches the server (server-blind).
 *
 * Note: the sealed blob (`storedKeys`) contains only the one-way Argon2id
 * `passwordWrap`, never the plaintext password.
 */

const DB_NAME = "dodi-sealed-secret";
const STORE = "secret";
const RECORD_KEY = "self";

/**
 * How long a sealed secret stays usable. Past this we drop it; the caller then
 * falls back (registration → re-enter password at /finish-setup). Bounds the
 * exposure window of an abandoned registration; aligned with the OTP expiry.
 */
const TTL_MS = 60 * 60 * 1000; // 1 hour

interface SealedSecret {
  /** Non-extractable AES-GCM key — can decrypt in-page, never leaves the browser. */
  key: CryptoKey;
  // Pinned to ArrayBuffer (not ArrayBufferLike) so it satisfies BufferSource on
  // the WebCrypto calls under the current lib.dom typings.
  iv: Uint8Array<ArrayBuffer>;
  ciphertext: ArrayBuffer;
  createdAt: number;
}

export interface CredentialStore {
  load(): Promise<SealedSecret | null>;
  save(record: SealedSecret): Promise<void>;
  clear(): Promise<void>;
}

function subtle(): SubtleCrypto | null {
  return typeof globalThis.crypto !== "undefined"
    ? globalThis.crypto.subtle
    : null;
}

// ---------------------------------------------------------------------------
// In-memory store (tests / SSR fallback)
// ---------------------------------------------------------------------------

export function createInMemoryCredentialStore(): CredentialStore {
  let stored: SealedSecret | null = null;
  return {
    load: () => Promise.resolve(stored),
    save: (record) => {
      stored = record;
      return Promise.resolve();
    },
    clear: () => {
      stored = null;
      return Promise.resolve();
    },
  };
}

// ---------------------------------------------------------------------------
// IndexedDB store (browser). `indexedDB` is referenced lazily so this module is
// import-safe under Node/SSR. Mirrors core/vault device-keystore conventions.
// ---------------------------------------------------------------------------

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

function createIndexedDbCredentialStore(): CredentialStore {
  return {
    async load() {
      const db = await openDb();
      try {
        return await new Promise<SealedSecret | null>((resolve, reject) => {
          const req = db
            .transaction(STORE, "readonly")
            .objectStore(STORE)
            .get(RECORD_KEY);
          req.onsuccess = () =>
            resolve((req.result as SealedSecret | undefined) ?? null);
          req.onerror = () => reject(req.error);
        });
      } finally {
        db.close();
      }
    },
    async save(record) {
      const db = await openDb();
      try {
        const tx = db.transaction(STORE, "readwrite");
        // Structured clone preserves the CryptoKey + typed-array/buffer fields.
        tx.objectStore(STORE).put(record, RECORD_KEY);
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

function defaultStore(): CredentialStore | null {
  return typeof indexedDB !== "undefined"
    ? createIndexedDbCredentialStore()
    : null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Seal `secret` for this browser (overwrites any prior slot). No-op — leaving the
 * caller's fallback in play — when no secure store or WebCrypto is available.
 */
export async function stashSealedSecret(
  secret: string,
  store: CredentialStore | null = defaultStore(),
): Promise<void> {
  const s = subtle();
  if (!store || !s) return;
  const key = await s.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await s.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(secret),
  );
  await store.save({ key, iv, ciphertext, createdAt: Date.now() });
}

/**
 * Read + WIPE the sealed secret (single-use). Returns `null` when nothing is
 * stashed, it has expired, or decryption fails (tampering / wrong browser). The
 * stash is always dropped, even on failure, so a sealed secret is never retried.
 */
export async function consumeSealedSecret(
  store: CredentialStore | null = defaultStore(),
): Promise<string | null> {
  const s = subtle();
  if (!store || !s) return null;
  const record = await store.load();
  await store.clear();
  if (!record) return null;
  if (Date.now() - record.createdAt > TTL_MS) return null;
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

/** Best-effort wipe of a pending sealed secret. */
export async function clearSealedSecret(
  store: CredentialStore | null = defaultStore(),
): Promise<void> {
  if (!store) return;
  await store.clear();
}

/**
 * What a client app plugs into the shared stores: the transport, device-local
 * storage and the few session-scoped flags that differ between the browser
 * and the native app. The store logic (single-flight caches, the vault unlock
 * flows, E2EE decrypt points) lives once in this package.
 */

import type { DeviceKeystore, StoredVaultKeys } from "@dodi/vault";

/** The platform HTTP API (a `DodiClient` satisfies this). */
export interface PlatformApi {
  request(path: string, init?: RequestInit): Promise<Response>;
  getVaultKeys(): Promise<StoredVaultKeys | null>;
  putVaultKeys(keys: StoredVaultKeys, opts?: { npub?: string }): Promise<void>;
}

/**
 * Device-local CIPHERTEXT cache for offline use. Rows are stored exactly as the
 * platform returned them; decrypted plaintext is never written. Best-effort:
 * reads resolve null and writes resolve void on any failure.
 */
export interface OfflineCache {
  writeVaultKeys(keys: unknown): Promise<void>;
  readVaultKeys<T>(): Promise<T | null>;
  writeKidRows(rows: unknown[]): Promise<void>;
  readKidRows<T>(): Promise<T[] | null>;
  writeGameRows(kidId: string, rows: unknown[]): Promise<void>;
  readGameRows<T>(kidId: string): Promise<T[] | null>;
}

/**
 * How long a `SealedSecretSlot` stash stays usable: the lifetime of the
 * platform's sign-up email code. Past it `consume` resolves null (and wipes),
 * bounding the exposure window of an abandoned registration; the caller falls
 * back to re-entering the password at finish-setup.
 */
export const SEALED_SECRET_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * One device-local slot for a short-lived secret (the vault built at
 * registration, held across the email-code round trip). `consume` reads and
 * wipes in one go, and resolves null once the stash is older than
 * `SEALED_SECRET_TTL_MS`.
 */
export interface SealedSecretSlot {
  stash(secret: string): Promise<void>;
  consume(): Promise<string | null>;
  clear(): Promise<void>;
}

/** The per-session "parent area unlocked" flag (set on strong-auth unlock). */
export interface ParentLock {
  markUnlocked(): void;
  clear(): void;
}

/** Synchronous key-value storage for small device preferences. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Synchronous device storage that can also delete (outboxes, small markers). */
export interface DeviceStorage extends KeyValueStorage {
  removeItem(key: string): void;
}

/** Where the active kid and this session's solved avatar-PIN puzzles persist. */
export interface ActiveKidPersistence {
  readActiveKidId(): string | null;
  /** Persist the active kid (and its language, for the UI locale). */
  writeActiveKid(kid: { id: string; language: string | null }): void;
  readUnlockedKidIds(): Set<string>;
  writeUnlockedKidIds(ids: Set<string>): void;
}

export interface ClientPlatform {
  api: PlatformApi;
  /** The signed-in user's session token (bearer for dodi AI), null when signed out. */
  getAccessToken(): string | null;
  /** The dodi AI control plane origin; null ⇒ self-host mode (BYOK only). */
  dodiAIUrl: string | null;
  fetch: typeof fetch;
  offlineCache: OfflineCache;
  deviceKeystore: DeviceKeystore;
  registrationSeal: SealedSecretSlot;
  parentLock: ParentLock;
  activeKid: ActiveKidPersistence;
  /** Device preferences that outlive the session (companion volume). */
  preferences: KeyValueStorage;
  /** The platform's first connectivity guess; data stores correct it. */
  isInitiallyOnline: boolean;
}

/**
 * Provider-agnostic encrypted storage port.
 *
 * Under E2EE the server is a "dumb encrypted blob store": it holds ciphertext
 * plus a small amount of PLAINTEXT routing/filter metadata, and never sees
 * personal data. This port is implemented by interchangeable adapters:
 *   - SupabaseVaultStore  (P1, hosted now)
 *   - SqliteVaultStore    (P3, home companion / self-hosted)
 *   - VitonomiVaultStore  (deferred — Vitonomi is WIP; the architecture is
 *                          prepared for it but the adapter is not built)
 *
 * Personal fields are sealed client-side before they ever reach a VaultStore.
 */
import type { KemWrappedKey, PasswordWrappedKey } from "@dodi/crypto";

/** Logical record kinds. Maps to a table (Supabase) or a document type (vault). */
export type VaultCollection =
  | "kid"
  | "persona"
  | "game"
  | "game_translation"
  | "agent_session"
  | "event_log";

/** JSON-safe scalar allowed in plaintext metadata. */
export type MetadataValue = string | number | boolean | null;

/**
 * One stored encrypted record. `ciphertext` is a self-describing versioned
 * envelope (see `@dodi/crypto` record format). `metadata` holds ONLY
 * operational fields that the server is allowed to see and query
 * (ids, FKs, enums, timestamps, the public `social_id`) — never personal data.
 */
export interface EncryptedRecord {
  id: string;
  accountId: string;
  collection: VaultCollection;
  ciphertext: string;
  metadata: Record<string, MetadataValue>;
  createdAt: string;
  updatedAt: string;
}

/** Equality/range query over PLAINTEXT metadata only (encrypted fields aren't queryable). */
export interface VaultQuery {
  collection: VaultCollection;
  accountId: string;
  where?: Record<string, MetadataValue>;
  orderBy?: { field: string; direction: "asc" | "desc" };
  limit?: number;
}

export interface VaultRecordInput {
  id?: string;
  accountId: string;
  collection: VaultCollection;
  ciphertext: string;
  metadata: Record<string, MetadataValue>;
}

/**
 * The storage contract every backend implements identically. Ownership/authz
 * (replacing Supabase RLS for non-Supabase backends) is enforced inside the
 * adapter against the authenticated account.
 */
export interface VaultStore {
  get(collection: VaultCollection, id: string): Promise<EncryptedRecord | null>;
  list(query: VaultQuery): Promise<EncryptedRecord[]>;
  put(record: VaultRecordInput): Promise<EncryptedRecord>;
  patch(
    collection: VaultCollection,
    id: string,
    changes: { ciphertext?: string; metadata?: Record<string, MetadataValue> },
  ): Promise<EncryptedRecord>;
  delete(collection: VaultCollection, id: string): Promise<void>;
}

/**
 * The account's Vault Master Key, wrapped for daily-use convenience and stored
 * server-side as opaque blobs. The server cannot derive the VMK from any of
 * these without the password or a device secret key. Recovery itself needs NO
 * stored blob — the nsec account key deterministically reproduces the VMK
 * (see `deriveVaultMasterKeyFromNsec`).
 */
export interface StoredVaultKeys {
  /** One entry per authorized device/companion (ML-KEM-wrapped VMK). */
  deviceWraps: Array<{
    deviceId: string;
    /** base64url ML-KEM-768 public key of the device. */
    deviceKemPublicKey: string;
    wrapped: KemWrappedKey;
  }>;
  /** VMK wrapped by the Argon2id password key (null until a password is set). */
  passwordWrap: PasswordWrappedKey | null;
  /**
   * A known constant sealed under the VMK. Lets nsec recovery verify the
   * derived key is correct *before* trusting it — a wrong-but-valid nsec
   * derives a different VMK that would otherwise fail silently later.
   * (Password/device unlock self-verify via the AEAD auth tag.)
   */
  vmkCheck: string;
}

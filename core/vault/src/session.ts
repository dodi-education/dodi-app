/**
 * In-memory vault session — holds the unwrapped Vault Master Key for the current
 * tab and exposes field encrypt/decrypt. This is the object the data layer uses
 * to seal personal fields before they leave the browser and to open them after
 * fetching ciphertext. The VMK is never persisted in plaintext.
 */
import {
  type Argon2Params,
  type PasswordWrappedKey,
  decryptField,
  encryptField,
  isEncryptedField,
  wrapKeyWithPassword,
} from "@dodi/crypto";

import { addDeviceToVault, type DeviceRegistration } from "./account-keys";
import type { StoredVaultKeys } from "./types";

export class VaultSession {
  #vmk: Uint8Array | null;

  constructor(vmk: Uint8Array) {
    this.#vmk = vmk;
  }

  get locked(): boolean {
    return this.#vmk === null;
  }

  /** Encrypt a string field into the versioned `enc:v1:` record. */
  encryptField(plaintext: string): string {
    if (!this.#vmk) throw new Error("Vault is locked");
    return encryptField(this.#vmk, plaintext);
  }

  /**
   * Decrypt a stored field. `null`/`undefined` → `null`; non-`enc:v1:` values
   * pass through unchanged (no key needed); encrypted values require an unlocked
   * vault.
   */
  decryptField(stored: string | null | undefined): string | null {
    if (stored == null) return null;
    if (!isEncryptedField(stored)) return stored;
    if (!this.#vmk) throw new Error("Vault is locked");
    return decryptField(this.#vmk, stored);
  }

  /** Encrypt a JSON-serializable value (e.g. avatar_config). */
  encryptJson(value: unknown): string {
    return this.encryptField(JSON.stringify(value));
  }

  /** Decrypt a value previously sealed with `encryptJson`. */
  decryptJson<T>(stored: string | null | undefined): T | null {
    const plain = this.decryptField(stored);
    return plain == null ? null : (JSON.parse(plain) as T);
  }

  /**
   * Re-wrap the in-memory VMK under a new password (device-session reset): the
   * user is on a trusted, already-unlocked device and wants a new password
   * without the old one or the recovery phrase. The raw VMK never leaves the
   * session — only the resulting wrap does.
   */
  rewrapPassword(
    newPassword: string,
    params?: Argon2Params,
  ): Promise<PasswordWrappedKey> {
    if (!this.#vmk) throw new Error("Vault is locked");
    return wrapKeyWithPassword(newPassword, this.#vmk, params);
  }

  /**
   * Authorize another device against the vault using the in-memory VMK: wrap the
   * VMK to the new device's KEM public key and return the updated keys to
   * persist. Mirrors `rewrapPassword` — the raw VMK never leaves the session.
   */
  addDevice(
    storedKeys: StoredVaultKeys,
    device: DeviceRegistration,
  ): StoredVaultKeys {
    if (!this.#vmk) throw new Error("Vault is locked");
    return addDeviceToVault(storedKeys, this.#vmk, device);
  }

  /** Zero and drop the key from memory. */
  lock(): void {
    this.#vmk?.fill(0);
    this.#vmk = null;
  }
}

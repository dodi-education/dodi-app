/**
 * Self-describing, versioned field-encryption format for at-rest values stored
 * in `text` columns (P1: birthdate, memory, parent_notes, soul, …).
 *
 * Format:  enc:v1:<keyId>:<nonceB64url>:<ciphertextB64url>
 *
 * - The `enc:v1:` sentinel lets readers detect ciphertext vs. legacy plaintext,
 *   so un-migrated rows pass through untouched (no throw) during rollout.
 * - `<keyId>` records which key version sealed the value, enabling rotation
 *   (the lesson from the API-key lockout incident: version every blob).
 * - base64url segments never contain ':', so split-on-colon is unambiguous.
 */
import { bytesToUtf8, fromBase64Url, toBase64Url, utf8ToBytes } from "./encoding";
import { open, seal } from "./primitives";

const FIELD_PREFIX = "enc:v1:";
export const DEFAULT_KEY_ID = "k1";

export function isEncryptedField(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(FIELD_PREFIX);
}

/** Encrypt a string field with the given key into the versioned record string. */
export function encryptField(
  key: Uint8Array,
  plaintext: string,
  keyId: string = DEFAULT_KEY_ID,
): string {
  const sealed = seal(key, utf8ToBytes(plaintext));
  return (
    FIELD_PREFIX +
    keyId +
    ":" +
    toBase64Url(sealed.nonce) +
    ":" +
    toBase64Url(sealed.ciphertext)
  );
}

/**
 * Decrypt a stored field.
 * - `null`/`undefined` → `null`.
 * - Legacy plaintext (no `enc:v1:` prefix) → returned unchanged (passthrough).
 * - A malformed or tampered `enc:v1:` value → throws (real error, not legacy).
 */
export function decryptField(
  key: Uint8Array,
  stored: string | null | undefined,
): string | null {
  if (stored == null) return null;
  if (!isEncryptedField(stored)) return stored;

  const parts = stored.split(":");
  // ["enc", "v1", keyId, nonce, ciphertext]
  if (parts.length !== 5) {
    throw new Error("Malformed encrypted field");
  }
  const nonce = fromBase64Url(parts[3]);
  const ciphertext = fromBase64Url(parts[4]);
  return bytesToUtf8(open(key, { nonce, ciphertext }));
}

/** The key id a stored record was sealed under, or null for legacy plaintext. */
export function fieldKeyId(stored: string | null | undefined): string | null {
  if (!isEncryptedField(stored)) return null;
  return (stored as string).split(":")[2] ?? null;
}

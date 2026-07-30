/**
 * Vault key hierarchy (wallet-style).
 *
 * The Nostr **nsec account key is the deterministic root** (see `nsec.ts`): it
 * derives the account's Vault Master Key (VMK), which (via derived sub-keys)
 * encrypts all personal records. Entering the nsec always reproduces the same
 * VMK, so recovery needs no server-side blob.
 *
 * For daily convenience the VMK is ALSO wrapped and stored server-side as
 * opaque blobs, so users don't retype the nsec every session/device:
 *   1. to each authorized device's ML-KEM public key (multi-device / companion)
 *   2. by an Argon2id key derived from the account password (password unlock)
 *
 * These are conveniences, NOT independent roots — the nsec remains the single
 * source of truth and the only recovery path. A password *change* re-wraps the
 * same VMK (no data loss — the fix for the original lockout). Lose the nsec
 * AND the password AND all devices → data is unrecoverable (provider-blind).
 *
 * All wrapped blobs are JSON-serializable (base64url strings) for storage.
 */
import { fromBase64Url, toBase64Url } from "./encoding";
import {
  type Argon2Params,
  type KemKeyPair,
  type SignKeyPair,
  DEFAULT_ARGON2_PARAMS,
  deriveKeyFromPassword,
  generateKemKeyPair,
  generateSignKeyPair,
  generateSymmetricKey,
  kemDecrypt,
  kemEncrypt,
  open,
  randomBytes,
  seal,
} from "./primitives";

// ---------------------------------------------------------------------------
// Vault Master Key + device identity
// ---------------------------------------------------------------------------

/**
 * Generate a random 32-byte symmetric key. For an *account* VMK, derive it from
 * the nsec instead (`deriveVaultMasterKeyFromNsec`); this helper is for
 * ephemeral/per-record keys and tests.
 */
export function generateVaultMasterKey(): Uint8Array {
  return generateSymmetricKey();
}

/** A device's long-term post-quantum identity: KEM (receive keys) + DSA (sign). */
export interface DeviceKeyPairs {
  kem: KemKeyPair;
  sign: SignKeyPair;
}

export function generateDeviceKeyPairs(): DeviceKeyPairs {
  return { kem: generateKemKeyPair(), sign: generateSignKeyPair() };
}

// ---------------------------------------------------------------------------
// (1) Wrap the VMK to a device's ML-KEM public key
// ---------------------------------------------------------------------------

export interface KemWrappedKey {
  v: 1;
  scheme: "kem";
  alg: "ml-kem-768";
  kemCiphertext: string;
  nonce: string;
  ciphertext: string;
}

export function wrapKeyForDevice(
  devicePublicKey: Uint8Array,
  key: Uint8Array,
): KemWrappedKey {
  const sealed = kemEncrypt(devicePublicKey, key);
  return {
    v: 1,
    scheme: "kem",
    alg: "ml-kem-768",
    kemCiphertext: toBase64Url(sealed.kemCiphertext),
    nonce: toBase64Url(sealed.nonce),
    ciphertext: toBase64Url(sealed.ciphertext),
  };
}

export function unwrapKeyWithDevice(
  deviceSecretKey: Uint8Array,
  wrapped: KemWrappedKey,
): Uint8Array {
  return kemDecrypt(deviceSecretKey, {
    kemCiphertext: fromBase64Url(wrapped.kemCiphertext),
    nonce: fromBase64Url(wrapped.nonce),
    ciphertext: fromBase64Url(wrapped.ciphertext),
  });
}

// ---------------------------------------------------------------------------
// (2) Wrap the VMK with a password (Argon2id)
// ---------------------------------------------------------------------------

export interface PasswordWrappedKey {
  v: 1;
  scheme: "password";
  kdf: "argon2id";
  salt: string;
  params: Argon2Params;
  nonce: string;
  ciphertext: string;
}

export async function wrapKeyWithPassword(
  password: string,
  key: Uint8Array,
  params: Argon2Params = DEFAULT_ARGON2_PARAMS,
): Promise<PasswordWrappedKey> {
  const salt = randomBytes(16);
  const kek = await deriveKeyFromPassword(password, salt, params);
  const sealed = seal(kek, key);
  return {
    v: 1,
    scheme: "password",
    kdf: "argon2id",
    salt: toBase64Url(salt),
    params,
    nonce: toBase64Url(sealed.nonce),
    ciphertext: toBase64Url(sealed.ciphertext),
  };
}

export async function unwrapKeyWithPassword(
  password: string,
  wrapped: PasswordWrappedKey,
): Promise<Uint8Array> {
  const kek = await deriveKeyFromPassword(
    password,
    fromBase64Url(wrapped.salt),
    wrapped.params,
  );
  return open(kek, {
    nonce: fromBase64Url(wrapped.nonce),
    ciphertext: fromBase64Url(wrapped.ciphertext),
  });
}

/** Password change: unwrap with the old password, re-wrap the same key under the new one. */
export async function rewrapKeyWithNewPassword(
  oldPassword: string,
  wrapped: PasswordWrappedKey,
  newPassword: string,
  params: Argon2Params = wrapped.params,
): Promise<PasswordWrappedKey> {
  const key = await unwrapKeyWithPassword(oldPassword, wrapped);
  return wrapKeyWithPassword(newPassword, key, params);
}

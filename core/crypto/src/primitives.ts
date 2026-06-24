/**
 * Low-level cryptographic primitives for Dodi's E2EE layer.
 *
 * Suite is aligned with Vitonomi (the target vault) so encrypted data is
 * portable and quantum-proof:
 *   - Symmetric:  XChaCha20-Poly1305 (192-bit nonce → safe random nonces)
 *   - KEM:        ML-KEM-768   (key wrapping to devices/recipients)
 *   - Signatures: ML-DSA-65    (identity, device pairing, server attestation)
 *   - KDF:        Argon2id     (password → key)
 *   - HKDF-SHA256 for deriving sub-keys from high-entropy secrets.
 *
 * This module is the ONLY place that imports the underlying crypto libraries,
 * so the rest of the app is insulated from library API churn.
 */
import { xchacha20poly1305 } from "@noble/ciphers/chacha";
import { argon2id } from "@noble/hashes/argon2";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha2";
import { randomBytes } from "@noble/hashes/utils";
import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";
import { ml_dsa65 } from "@noble/post-quantum/ml-dsa.js";

import { utf8ToBytes } from "./encoding";

export { randomBytes };

export const SYM_KEY_LENGTH = 32;
export const XCHACHA_NONCE_LENGTH = 24;

// ---------------------------------------------------------------------------
// Symmetric encryption (XChaCha20-Poly1305, AEAD)
// ---------------------------------------------------------------------------

export interface SealedBytes {
  nonce: Uint8Array;
  ciphertext: Uint8Array; // includes the Poly1305 auth tag
}

export function generateSymmetricKey(): Uint8Array {
  return randomBytes(SYM_KEY_LENGTH);
}

/** Encrypt with a fresh random 24-byte nonce. Optional additional data is authenticated. */
export function seal(
  key: Uint8Array,
  plaintext: Uint8Array,
  additionalData?: Uint8Array,
): SealedBytes {
  const nonce = randomBytes(XCHACHA_NONCE_LENGTH);
  const ciphertext = xchacha20poly1305(key, nonce, additionalData).encrypt(
    plaintext,
  );
  return { nonce, ciphertext };
}

/** Decrypt and verify. Throws on a wrong key, tampered ciphertext, or bad AAD. */
export function open(
  key: Uint8Array,
  sealed: SealedBytes,
  additionalData?: Uint8Array,
): Uint8Array {
  return xchacha20poly1305(key, sealed.nonce, additionalData).decrypt(
    sealed.ciphertext,
  );
}

// ---------------------------------------------------------------------------
// Key derivation
// ---------------------------------------------------------------------------

export interface Argon2Params {
  /** time cost (iterations) */
  t: number;
  /** memory cost in KiB */
  m: number;
  /** parallelism */
  p: number;
  /** derived key length in bytes */
  dkLen: number;
}

/** OWASP-leaning interactive defaults; tune per device benchmarking. */
export const DEFAULT_ARGON2_PARAMS: Argon2Params = {
  t: 3,
  m: 65536, // 64 MiB
  p: 4,
  dkLen: SYM_KEY_LENGTH,
};

/** Derive a 32-byte key from a (low-entropy) password via Argon2id. */
export function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array,
  params: Argon2Params = DEFAULT_ARGON2_PARAMS,
): Uint8Array {
  return argon2id(utf8ToBytes(password), salt, {
    t: params.t,
    m: params.m,
    p: params.p,
    dkLen: params.dkLen,
  });
}

/** Derive a sub-key from a high-entropy secret (e.g. a KEM shared secret). */
export function deriveKey(
  ikm: Uint8Array,
  info: string,
  salt?: Uint8Array,
  length: number = SYM_KEY_LENGTH,
): Uint8Array {
  return hkdf(sha256, ikm, salt, utf8ToBytes(info), length);
}

// ---------------------------------------------------------------------------
// ML-KEM-768 (post-quantum key encapsulation) — KEM-DEM hybrid encryption
// ---------------------------------------------------------------------------

export interface KemKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export interface KemSealedBytes {
  kemCiphertext: Uint8Array; // ML-KEM ciphertext carrying the shared secret
  nonce: Uint8Array;
  ciphertext: Uint8Array; // payload sealed under the derived shared key
}

const KEM_WRAP_INFO = "dodi/kem-wrap/v1";

export function generateKemKeyPair(): KemKeyPair {
  return ml_kem768.keygen();
}

/** Encrypt `payload` to a recipient's ML-KEM public key (post-quantum). */
export function kemEncrypt(
  recipientPublicKey: Uint8Array,
  payload: Uint8Array,
): KemSealedBytes {
  const { cipherText, sharedSecret } =
    ml_kem768.encapsulate(recipientPublicKey);
  const wrapKey = deriveKey(sharedSecret, KEM_WRAP_INFO);
  const sealed = seal(wrapKey, payload);
  return {
    kemCiphertext: cipherText,
    nonce: sealed.nonce,
    ciphertext: sealed.ciphertext,
  };
}

/** Decrypt a `kemEncrypt` payload with the recipient's ML-KEM secret key. */
export function kemDecrypt(
  recipientSecretKey: Uint8Array,
  sealed: KemSealedBytes,
): Uint8Array {
  const sharedSecret = ml_kem768.decapsulate(
    sealed.kemCiphertext,
    recipientSecretKey,
  );
  const wrapKey = deriveKey(sharedSecret, KEM_WRAP_INFO);
  return open(wrapKey, { nonce: sealed.nonce, ciphertext: sealed.ciphertext });
}

// ---------------------------------------------------------------------------
// ML-DSA-65 (post-quantum signatures)
// ---------------------------------------------------------------------------

export interface SignKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export function generateSignKeyPair(): SignKeyPair {
  return ml_dsa65.keygen();
}

export function sign(secretKey: Uint8Array, message: Uint8Array): Uint8Array {
  return ml_dsa65.sign(message, secretKey);
}

export function verify(
  publicKey: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array,
): boolean {
  return ml_dsa65.verify(signature, message, publicKey);
}

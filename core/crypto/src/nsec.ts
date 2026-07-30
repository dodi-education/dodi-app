/**
 * Nostr account key (nsec) — the account's **deterministic root**.
 *
 * A 32-byte secp256k1 secret key, shown to the user once as bech32 `nsec1…`
 * (NIP-19), derives the Vault Master Key (VMK). Entering the nsec always
 * reproduces the same VMK, so recovery needs no server-side blob — just the
 * key. It is the single source of truth and the only path back in if password
 * + devices are lost (the price of provider-blindness). The matching public
 * key (`npub`, stored as lowercase hex) is the account's portable identity.
 *
 * The nsec never leaves the client: not in API bodies, logs, or the DB.
 */
import { schnorr, secp256k1 } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { bech32 } from "@scure/base";

import { deriveKey } from "./primitives";

const VMK_DERIVATION_INFO = "dodi/vmk/v1";

const HEX_KEY_RE = /^[0-9a-fA-F]{64}$/;
const NSEC_PREFIX = "nsec";
const NPUB_PREFIX = "npub";

function encodeBech32(prefix: string, bytes: Uint8Array): string {
  return bech32.encode(prefix, bech32.toWords(bytes));
}

/** Generate a fresh nsec (valid secp256k1 secret key) as canonical bech32. */
export function generateNsec(): string {
  return encodeBech32(NSEC_PREFIX, secp256k1.utils.randomSecretKey());
}

/**
 * Parse an nsec from user input: bech32 `nsec1…` (upper- or lowercase) or a
 * 64-char hex string. Returns the 32-byte secret. Throws a generic error on
 * anything else — wrong prefix (e.g. a pasted npub), bad checksum, mixed-case
 * bech32, wrong length, or an out-of-range scalar. The error never echoes the
 * input (it may be one typo away from the real key).
 */
export function parseNsec(input: string): Uint8Array {
  const candidate = input.trim();
  try {
    let bytes: Uint8Array;
    if (HEX_KEY_RE.test(candidate)) {
      bytes = hexToBytes(candidate.toLowerCase());
    } else {
      const decoded = bech32.decodeToBytes(candidate);
      if (decoded.prefix !== NSEC_PREFIX) throw new Error("wrong prefix");
      bytes = decoded.bytes;
    }
    if (bytes.length !== 32 || !secp256k1.utils.isValidSecretKey(bytes)) {
      throw new Error("not a valid secret key");
    }
    return bytes;
  } catch {
    throw new Error("Invalid account key");
  }
}

/** True if the input parses as an nsec (bech32 or hex). */
export function isValidNsec(input: string): boolean {
  try {
    parseNsec(input);
    return true;
  } catch {
    return false;
  }
}

/** Re-encode any accepted input form as the canonical lowercase bech32 nsec. */
export function normalizeNsec(input: string): string {
  return encodeBech32(NSEC_PREFIX, parseNsec(input));
}

/** Derive the public key (x-only schnorr pubkey) as 64-char lowercase hex. */
export function nsecToNpubHex(nsec: string): string {
  return bytesToHex(schnorr.getPublicKey(parseNsec(nsec)));
}

/** Render a stored hex npub as bech32 `npub1…` for display (NIP-19). */
export function npubHexToBech32(npubHex: string): string {
  if (!HEX_KEY_RE.test(npubHex)) throw new Error("Invalid npub");
  return encodeBech32(NPUB_PREFIX, hexToBytes(npubHex.toLowerCase()));
}

/**
 * Deterministically derive the 32-byte Vault Master Key from the nsec.
 * Domain-separated from Nostr signing via the HKDF info string, so the raw
 * signing key is never reused as an encryption key. Throws on an invalid nsec
 * (caught before a confusing decryption failure downstream).
 */
export function deriveVaultMasterKeyFromNsec(nsec: string): Uint8Array {
  const secret = parseNsec(nsec);
  try {
    return deriveKey(secret, VMK_DERIVATION_INFO);
  } finally {
    secret.fill(0);
  }
}

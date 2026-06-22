/**
 * Wallet-style backup phrase (BIP-39).
 *
 * A 12-word (128-bit) mnemonic is the account's **deterministic root**: it
 * derives the Vault Master Key (VMK). Entering the phrase always reproduces the
 * same VMK, so recovery needs no server-side blob — just the words. This is the
 * single source of truth and the only path back in if password + devices are
 * lost (the price of provider-blindness).
 */
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

import { deriveKey } from "./primitives";

const VMK_DERIVATION_INFO = "dodi/vmk/v1";

/** Generate a fresh 12-word (128-bit) BIP-39 backup phrase. */
export function generateBackupPhrase(): string {
  return generateMnemonic(wordlist, 128);
}

/** Normalize user input: trim, lowercase, collapse internal whitespace. */
export function normalizeBackupPhrase(phrase: string): string {
  return phrase.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Validate a phrase against the BIP-39 word list and checksum. */
export function isValidBackupPhrase(phrase: string): boolean {
  return validateMnemonic(normalizeBackupPhrase(phrase), wordlist);
}

/**
 * Deterministically derive the 32-byte Vault Master Key from the backup phrase.
 * Throws if the phrase fails BIP-39 validation (caught before a confusing
 * decryption failure downstream).
 */
export function deriveVaultMasterKeyFromPhrase(phrase: string): Uint8Array {
  const normalized = normalizeBackupPhrase(phrase);
  if (!validateMnemonic(normalized, wordlist)) {
    throw new Error("Invalid backup phrase");
  }
  const seed = mnemonicToSeedSync(normalized); // 64 bytes, deterministic
  return deriveKey(seed, VMK_DERIVATION_INFO);
}

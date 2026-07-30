import { describe, expect, it } from "vitest";

import { constantTimeEqual } from "./encoding";
import {
  deriveVaultMasterKeyFromNsec,
  generateNsec,
  isValidNsec,
  normalizeNsec,
  npubHexToBech32,
  nsecToNpubHex,
  parseNsec,
} from "./nsec";

// NIP-19 spec test vectors.
const VECTOR_NSEC =
  "nsec1vl029mgpspedva04g90vltkh6fvh240zqtv9k0t9af8935ke9laqsnlfe5";
const VECTOR_NSEC_HEX =
  "67dea2ed018072d675f5415ecfaed7d2597555e202d85b3d65ea4e58d2d92ffa";
const VECTOR_NPUB =
  "npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6";
const VECTOR_NPUB_HEX =
  "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d";

describe("nsec account key (NIP-19)", () => {
  it("generates a valid, unique bech32 nsec", () => {
    const nsec = generateNsec();
    expect(nsec.startsWith("nsec1")).toBe(true);
    expect(nsec).toHaveLength(63);
    expect(isValidNsec(nsec)).toBe(true);
    expect(generateNsec()).not.toBe(generateNsec());
  });

  it("matches the NIP-19 test vectors", () => {
    expect(normalizeNsec(VECTOR_NSEC_HEX)).toBe(VECTOR_NSEC);
    expect(normalizeNsec(VECTOR_NSEC)).toBe(VECTOR_NSEC);
    expect(npubHexToBech32(VECTOR_NPUB_HEX)).toBe(VECTOR_NPUB);
  });

  it("parses bech32, hex, and uppercase forms to identical bytes", () => {
    const canonical = parseNsec(VECTOR_NSEC);
    for (const form of [
      VECTOR_NSEC_HEX,
      VECTOR_NSEC_HEX.toUpperCase(),
      VECTOR_NSEC.toUpperCase(),
      `  ${VECTOR_NSEC}  `,
    ]) {
      expect(constantTimeEqual(parseNsec(form), canonical)).toBe(true);
    }
  });

  it("normalizeNsec is idempotent and canonicalizes every accepted form", () => {
    const nsec = generateNsec();
    expect(normalizeNsec(nsec)).toBe(nsec);
    expect(normalizeNsec(nsec.toUpperCase())).toBe(nsec);
    expect(normalizeNsec(normalizeNsec(nsec))).toBe(nsec);
  });

  it("rejects everything that is not an nsec", () => {
    const invalid = [
      "",
      "garbage",
      VECTOR_NPUB, // right shape, wrong prefix — a pasted public key
      VECTOR_NSEC.slice(0, -1) + (VECTOR_NSEC.endsWith("5") ? "6" : "5"), // bad checksum
      "Nsec1vl029mgpspedva04g90vltkh6fvh240zqtv9k0t9af8935ke9laqsnlfe5", // mixed case
      "00".repeat(32), // zero scalar
      "ff".repeat(32), // ≥ curve order
      "ab".repeat(31), // 62-char hex: not a key, not bech32
      "twelve words separated by spaces like the old backup phrase input",
    ];
    for (const input of invalid) {
      expect(isValidNsec(input)).toBe(false);
      expect(() => parseNsec(input)).toThrow("Invalid account key");
    }
  });

  it("error output never echoes the input", () => {
    const secretLike = "ff".repeat(32);
    try {
      parseNsec(secretLike);
      expect.unreachable("parse should have thrown");
    } catch (error) {
      expect((error as Error).message).not.toContain(secretLike);
    }
  });

  it("derives the npub from the nsec (x-only schnorr pubkey, lowercase hex)", () => {
    const npubHex = nsecToNpubHex(generateNsec());
    expect(npubHex).toMatch(/^[0-9a-f]{64}$/);
    // Deterministic and encoding-independent.
    expect(nsecToNpubHex(VECTOR_NSEC)).toBe(nsecToNpubHex(VECTOR_NSEC_HEX));
  });

  it("derives a deterministic 32-byte VMK, stable across encodings", () => {
    const nsec = generateNsec();
    const vmk = deriveVaultMasterKeyFromNsec(nsec);
    expect(vmk).toHaveLength(32);
    expect(
      constantTimeEqual(vmk, deriveVaultMasterKeyFromNsec(nsec)),
    ).toBe(true);
    expect(
      constantTimeEqual(
        deriveVaultMasterKeyFromNsec(VECTOR_NSEC),
        deriveVaultMasterKeyFromNsec(VECTOR_NSEC_HEX.toUpperCase()),
      ),
    ).toBe(true);
  });

  it("VMK differs from the raw secret and between keys (domain separation)", () => {
    const vmk = deriveVaultMasterKeyFromNsec(VECTOR_NSEC);
    expect(constantTimeEqual(vmk, parseNsec(VECTOR_NSEC))).toBe(false);
    expect(
      constantTimeEqual(vmk, deriveVaultMasterKeyFromNsec(generateNsec())),
    ).toBe(false);
  });

  it("throws on an invalid nsec instead of deriving a bogus VMK", () => {
    expect(() => deriveVaultMasterKeyFromNsec("nsec1notakey")).toThrow();
    expect(() => npubHexToBech32("not-hex")).toThrow();
  });
});

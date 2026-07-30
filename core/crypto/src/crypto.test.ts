import { describe, expect, it } from "vitest";

import {
  bytesToUtf8,
  constantTimeEqual,
  fromBase64Url,
  toBase64Url,
  utf8ToBytes,
} from "./encoding";
import {
  type Argon2Params,
  deriveKeyFromPassword,
  generateKemKeyPair,
  generateSignKeyPair,
  generateSymmetricKey,
  open,
  seal,
  setArgon2idExecutor,
  sign,
  verify,
} from "./primitives";
import {
  DEFAULT_KEY_ID,
  decryptField,
  encryptField,
  fieldKeyId,
  isEncryptedField,
} from "./record";
import {
  rewrapKeyWithNewPassword,
  unwrapKeyWithDevice,
  unwrapKeyWithPassword,
  wrapKeyForDevice,
  wrapKeyWithPassword,
} from "./keys";
import { deriveVaultMasterKeyFromNsec, generateNsec } from "./nsec";

// Fast Argon2id params for tests (NOT production strength).
const TEST_ARGON2: Argon2Params = { t: 2, m: 8192, p: 1, dkLen: 32 };

describe("encoding", () => {
  it("round-trips base64url for all trailing-byte cases", () => {
    for (let len = 0; len <= 32; len++) {
      const bytes = new Uint8Array(len).map((_, i) => (i * 37 + 11) & 0xff);
      expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes);
    }
  });

  it("base64url output is URL/JSON safe (no + / =)", () => {
    const s = toBase64Url(new Uint8Array([251, 255, 191, 254, 0, 1, 2]));
    expect(s).not.toMatch(/[+/=]/);
  });

  it("round-trips unicode utf8", () => {
    const s = "Héllo 🦕 dinosaur — naïve café";
    expect(bytesToUtf8(utf8ToBytes(s))).toBe(s);
  });

  it("constantTimeEqual", () => {
    expect(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
    expect(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
    expect(constantTimeEqual(new Uint8Array([1]), new Uint8Array([1, 2]))).toBe(false);
  });
});

describe("symmetric seal/open (XChaCha20-Poly1305)", () => {
  it("round-trips", () => {
    const key = generateSymmetricKey();
    const msg = utf8ToBytes("secret payload");
    const sealed = seal(key, msg);
    expect(bytesToUtf8(open(key, sealed))).toBe("secret payload");
  });

  it("uses a fresh nonce each call (no nonce reuse)", () => {
    const key = generateSymmetricKey();
    const a = seal(key, utf8ToBytes("x"));
    const b = seal(key, utf8ToBytes("x"));
    expect(toBase64Url(a.nonce)).not.toBe(toBase64Url(b.nonce));
  });

  it("fails on a wrong key", () => {
    const sealed = seal(generateSymmetricKey(), utf8ToBytes("hi"));
    expect(() => open(generateSymmetricKey(), sealed)).toThrow();
  });

  it("fails on tampered ciphertext (auth tag)", () => {
    const key = generateSymmetricKey();
    const sealed = seal(key, utf8ToBytes("hi"));
    sealed.ciphertext[0] ^= 0xff;
    expect(() => open(key, sealed)).toThrow();
  });

  it("authenticates additional data", () => {
    const key = generateSymmetricKey();
    const sealed = seal(key, utf8ToBytes("hi"), utf8ToBytes("aad-1"));
    expect(bytesToUtf8(open(key, sealed, utf8ToBytes("aad-1")))).toBe("hi");
    expect(() => open(key, sealed, utf8ToBytes("aad-2"))).toThrow();
  });
});

describe("versioned field encryption", () => {
  const key = generateSymmetricKey();

  it("round-trips ASCII, unicode, multiline, ISO date, empty", () => {
    for (const value of [
      "Emma",
      "2018-04-05",
      "## About\n- loves dinosaurs 🦕\n- naïve café",
      "",
    ]) {
      const enc = encryptField(key, value);
      expect(isEncryptedField(enc)).toBe(true);
      expect(decryptField(key, enc)).toBe(value);
    }
  });

  it("has the expected self-describing format", () => {
    const enc = encryptField(key, "x");
    expect(enc).toMatch(/^enc:v1:k1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/);
    expect(fieldKeyId(enc)).toBe(DEFAULT_KEY_ID);
  });

  it("passes through legacy plaintext untouched", () => {
    expect(decryptField(key, "2018-04-05")).toBe("2018-04-05");
    expect(decryptField(key, "plain memory text")).toBe("plain memory text");
    expect(isEncryptedField("2018-04-05")).toBe(false);
    expect(fieldKeyId("2018-04-05")).toBeNull();
  });

  it("handles null/undefined", () => {
    expect(decryptField(key, null)).toBeNull();
    expect(decryptField(key, undefined)).toBeNull();
    expect(isEncryptedField(null)).toBe(false);
  });

  it("throws on a tampered enc:v1 value (not silent passthrough)", () => {
    const enc = encryptField(key, "secret");
    const parts = enc.split(":");
    parts[4] = parts[4].slice(0, -2) + "AA";
    expect(() => decryptField(key, parts.join(":"))).toThrow();
  });

  it("throws on a malformed enc:v1 value", () => {
    expect(() => decryptField(key, "enc:v1:k1:onlythree")).toThrow();
  });
});

describe("ML-DSA-65 signatures", () => {
  it("signs and verifies", () => {
    const { publicKey, secretKey } = generateSignKeyPair();
    const msg = utf8ToBytes("device-pairing-challenge");
    const sig = sign(secretKey, msg);
    expect(verify(publicKey, msg, sig)).toBe(true);
  });

  it("rejects a tampered message", () => {
    const { publicKey, secretKey } = generateSignKeyPair();
    const sig = sign(secretKey, utf8ToBytes("original"));
    expect(verify(publicKey, utf8ToBytes("tampered"), sig)).toBe(false);
  });

  it("rejects a signature from another key", () => {
    const a = generateSignKeyPair();
    const b = generateSignKeyPair();
    const msg = utf8ToBytes("m");
    expect(verify(b.publicKey, msg, sign(a.secretKey, msg))).toBe(false);
  });
});

describe("VMK wrapping (convenience unlock paths)", () => {
  it("wraps to a device ML-KEM key and unwraps", () => {
    const vmk = deriveVaultMasterKeyFromNsec(generateNsec());
    const device = generateKemKeyPair();
    const wrapped = wrapKeyForDevice(device.publicKey, vmk);
    expect(constantTimeEqual(unwrapKeyWithDevice(device.secretKey, wrapped), vmk)).toBe(true);
  });

  it("a different device cannot unwrap", () => {
    const vmk = deriveVaultMasterKeyFromNsec(generateNsec());
    const device = generateKemKeyPair();
    const attacker = generateKemKeyPair();
    const wrapped = wrapKeyForDevice(device.publicKey, vmk);
    expect(() => unwrapKeyWithDevice(attacker.secretKey, wrapped)).toThrow();
  });

  it("wraps with a password and unwraps; wrong password fails", async () => {
    const vmk = deriveVaultMasterKeyFromNsec(generateNsec());
    const wrapped = await wrapKeyWithPassword("correct horse", vmk, TEST_ARGON2);
    expect(
      constantTimeEqual(await unwrapKeyWithPassword("correct horse", wrapped), vmk),
    ).toBe(true);
    await expect(unwrapKeyWithPassword("wrong horse", wrapped)).rejects.toThrow();
  });

  it("password change re-wraps the SAME vmk (fixes the lockout)", async () => {
    const vmk = deriveVaultMasterKeyFromNsec(generateNsec());
    const wrapped = await wrapKeyWithPassword("old-pw", vmk, TEST_ARGON2);
    const rewrapped = await rewrapKeyWithNewPassword("old-pw", wrapped, "new-pw", TEST_ARGON2);
    expect(constantTimeEqual(await unwrapKeyWithPassword("new-pw", rewrapped), vmk)).toBe(true);
    await expect(unwrapKeyWithPassword("old-pw", rewrapped)).rejects.toThrow();
  });

  it("nsec, password, and device all recover one identical vmk", async () => {
    const nsec = generateNsec();
    const vmk = deriveVaultMasterKeyFromNsec(nsec);
    const device = generateKemKeyPair();
    const viaNsec = deriveVaultMasterKeyFromNsec(nsec);
    const viaPassword = await unwrapKeyWithPassword(
      "pw",
      await wrapKeyWithPassword("pw", vmk, TEST_ARGON2),
    );
    const viaDevice = unwrapKeyWithDevice(device.secretKey, wrapKeyForDevice(device.publicKey, vmk));
    expect(constantTimeEqual(viaNsec, vmk)).toBe(true);
    expect(constantTimeEqual(viaPassword, vmk)).toBe(true);
    expect(constantTimeEqual(viaDevice, vmk)).toBe(true);
  });
});

describe("Argon2id implementation compatibility", () => {
  // The KDF moved from @noble/hashes (pure JS) to hash-wasm (WASM). Both
  // implement standard Argon2id, so every wrap sealed under the old
  // implementation MUST unwrap under the new one. Guard that with a direct
  // cross-implementation comparison, including multi-lane params and
  // non-ASCII passwords.
  it("matches the @noble/hashes reference output", async () => {
    const { argon2id: nobleArgon2id } = await import("@noble/hashes/argon2");
    const salt = utf8ToBytes("fixed-salt-16byt");
    const cases: Array<{ password: string; params: Argon2Params }> = [
      { password: "correct horse", params: { t: 2, m: 8192, p: 1, dkLen: 32 } },
      { password: "pärent-pässwörd 🦕", params: { t: 3, m: 16384, p: 4, dkLen: 32 } },
      { password: " ", params: { t: 2, m: 8192, p: 2, dkLen: 32 } },
    ];
    for (const { password, params } of cases) {
      const viaWasm = await deriveKeyFromPassword(password, salt, params);
      const viaNoble = nobleArgon2id(utf8ToBytes(password), salt, params);
      expect(toBase64Url(viaWasm)).toBe(toBase64Url(viaNoble));
    }
  });

  it("rejects an empty password (hash-wasm difference vs noble; unreachable for real accounts)", async () => {
    // noble derived a key for "" — hash-wasm refuses. No account can have an
    // empty-password wrap (registration enforces a minimum length), so failing
    // loud is preferable to differing silently.
    const salt = utf8ToBytes("fixed-salt-16byt");
    await expect(
      deriveKeyFromPassword("", salt, { t: 2, m: 8192, p: 1, dkLen: 32 }),
    ).rejects.toThrow();
  });

  it("setArgon2idExecutor overrides and restores the execution strategy", async () => {
    const salt = utf8ToBytes("fixed-salt-16byt");
    const params: Argon2Params = { t: 2, m: 8192, p: 1, dkLen: 32 };
    const reference = await deriveKeyFromPassword("pw", salt, params);
    try {
      setArgon2idExecutor(async () => new Uint8Array(32).fill(7));
      const overridden = await deriveKeyFromPassword("pw", salt, params);
      expect(toBase64Url(overridden)).toBe(toBase64Url(new Uint8Array(32).fill(7)));
    } finally {
      setArgon2idExecutor(null);
    }
    const restored = await deriveKeyFromPassword("pw", salt, params);
    expect(toBase64Url(restored)).toBe(toBase64Url(reference));
  });
});

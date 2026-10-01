import { argon2idAsync } from "@noble/hashes/argon2";
import { describe, expect, it } from "vitest";

import { deriveKeyFromPassword, setArgon2idExecutor, type Argon2Params } from "./primitives";
import { utf8ToBytes } from "./encoding";

/**
 * Every client must derive the SAME key from a password, or a vault wrapped on
 * one device won't open on another. The web runs hash-wasm (the default
 * executor); the mobile app runs native Argon2 or, without the native module,
 * noble's pure-JS argon2id. This pins the JS path to the WASM one, and a fixed
 * vector to both (native builds check against the same vector on device).
 */
const PARAMS: Argon2Params = { t: 2, m: 1024, p: 2, dkLen: 32 };
const SALT = Uint8Array.from({ length: 16 }, (_, i) => i);
const PASSWORD = "correct horse battery staple ✓ äöü";

const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString("hex");

describe("Argon2id executors agree", () => {
  it("noble's pure-JS argon2id derives the hash-wasm key", async () => {
    setArgon2idExecutor(null);
    const wasm = await deriveKeyFromPassword(PASSWORD, SALT, PARAMS);

    setArgon2idExecutor((passwordBytes, salt, params) =>
      argon2idAsync(passwordBytes, salt, { t: params.t, m: params.m, p: params.p, dkLen: params.dkLen }),
    );
    try {
      const js = await deriveKeyFromPassword(PASSWORD, SALT, PARAMS);
      expect(hex(js)).toBe(hex(wasm));
    } finally {
      setArgon2idExecutor(null);
    }
  });

  it("matches the pinned vector (UTF-8 password, raw salt)", async () => {
    setArgon2idExecutor(null);
    const key = await deriveKeyFromPassword(PASSWORD, SALT, PARAMS);
    expect(utf8ToBytes(PASSWORD).length).toBeGreaterThan(PASSWORD.length);
    expect(hex(key)).toMatchInlineSnapshot(`"7aed30688531daedbdc296bc31928afc4956af6177863fe1c4e57fbe20dca83d"`);
  });
});

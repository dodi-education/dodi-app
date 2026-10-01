/**
 * Argon2id for the vault's password wrap. Hermes has no WebAssembly, so the
 * web's hash-wasm executor can't run here: the native module (Argon2Swift on
 * iOS, argon2kt on Android) does, off the JS thread. Same algorithm and
 * parameters, so a vault wrapped on the web opens on the phone and back.
 *
 * The executor receives the password already UTF-8 encoded; the native API
 * takes a string, and decoding valid UTF-8 back is lossless. The salt goes
 * over as hex.
 */
import { argon2idAsync } from "@noble/hashes/argon2";
import { NativeModules } from "react-native";
import { type Argon2idExecutor, bytesToUtf8, setArgon2idExecutor } from "@dodi/crypto";

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

export function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export const nativeArgon2id: Argon2idExecutor = async (passwordBytes, salt, params) => {
  // Imported lazily so a missing native build (Expo Go) fails at unlock with a
  // clear error instead of at app start.
  const { default: argon2 } = await import("react-native-argon2");
  const { rawHash } = await argon2(bytesToUtf8(passwordBytes), toHex(salt), {
    iterations: params.t,
    memory: params.m,
    parallelism: params.p,
    hashLength: params.dkLen,
    mode: "argon2id",
    saltEncoding: "hex",
  });
  return fromHex(rawHash);
};

/**
 * Pure-JS Argon2id (noble), for a build without the native module. Correct but
 * slow on Hermes (tens of seconds for the 64 MiB default); it yields between
 * blocks so the UI stays alive.
 */
export const jsArgon2id: Argon2idExecutor = (passwordBytes, salt, params) =>
  argon2idAsync(passwordBytes, salt, {
    t: params.t,
    m: params.m,
    p: params.p,
    dkLen: params.dkLen,
    asyncTick: 10,
  });

/** Route the vault's Argon2id through the native module, or the JS fallback. */
export function installArgon2(): void {
  setArgon2idExecutor(NativeModules.RNArgon2 ? nativeArgon2id : jsArgon2id);
}

/**
 * Dev builds check the active executor against the vector pinned in
 * core/crypto/src/argon2-compat.test.ts (the web's hash-wasm output). A
 * mismatch means vaults wrapped on this device won't open elsewhere.
 */
export async function verifyArgon2Executor(): Promise<boolean> {
  const { deriveKeyFromPassword } = await import("@dodi/crypto");
  const salt = Uint8Array.from({ length: 16 }, (_, i) => i);
  const key = await deriveKeyFromPassword("correct horse battery staple ✓ äöü", salt, {
    t: 2,
    m: 1024,
    p: 2,
    dkLen: 32,
  });
  const ok = toHex(key) === "7aed30688531daedbdc296bc31928afc4956af6177863fe1c4e57fbe20dca83d";
  if (!ok) console.error("[argon2] executor disagrees with the web's: vaults won't interoperate");
  return ok;
}

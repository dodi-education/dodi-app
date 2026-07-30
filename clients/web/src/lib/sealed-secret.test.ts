import { describe, expect, it } from "vitest";

import {
  clearSealedSecret,
  consumeSealedSecret,
  createInMemoryCredentialStore,
  stashSealedSecret,
} from "./sealed-secret";

// Representative registration payload: the vault wraps + the nsec to display.
// `passwordWrap.salt` and the nsec are the sensitive substrings that must never
// appear in the ciphertext at rest.
const NSEC = "nsec1vl029mgpspedva04g90vltkh6fvh240zqtv9k0t9af8935ke9laqsnlfe5";
const PASSWORD_SALT = "c2FsdC1iYXNlNjR1cmwtdmFsdWU";
const BLOB = JSON.stringify({
  storedKeys: {
    deviceWraps: [],
    passwordWrap: {
      v: 1,
      scheme: "password",
      kdf: "argon2id",
      salt: PASSWORD_SALT,
      params: { t: 3, m: 65536, p: 1, dkLen: 32 },
      nonce: "bm9uY2U",
      ciphertext: "Y2lwaGVydGV4dA",
    },
    vmkCheck: "enc:v1:abc",
  },
  nsec: NSEC,
});

describe("sealed secret", () => {
  it("seals then returns the secret exactly once (single-use)", async () => {
    const store = createInMemoryCredentialStore();
    await stashSealedSecret(BLOB, store);

    expect(await consumeSealedSecret(store)).toBe(BLOB);
    // Second read is empty — the stash is one-shot, never retried.
    expect(await consumeSealedSecret(store)).toBeNull();
  });

  it("returns null when nothing was stashed", async () => {
    const store = createInMemoryCredentialStore();
    expect(await consumeSealedSecret(store)).toBeNull();
  });

  it("never persists plaintext (no nsec, no salt), under a non-extractable key", async () => {
    const store = createInMemoryCredentialStore();
    await stashSealedSecret(BLOB, store);

    const record = await store.load();
    expect(record).not.toBeNull();
    expect(record!.key.extractable).toBe(false);
    const bytes = new TextDecoder().decode(new Uint8Array(record!.ciphertext));
    expect(bytes).not.toContain(NSEC);
    expect(bytes).not.toContain(PASSWORD_SALT);
  });

  it("drops an expired stash and returns null", async () => {
    const store = createInMemoryCredentialStore();
    await stashSealedSecret(BLOB, store);

    // Backdate the seal past the TTL without touching the clock.
    const record = await store.load();
    record!.createdAt -= 60 * 60 * 1000 + 1;
    await store.save(record!);

    expect(await consumeSealedSecret(store)).toBeNull();
  });

  it("returns null (not the secret) when the ciphertext is tampered", async () => {
    const store = createInMemoryCredentialStore();
    await stashSealedSecret(BLOB, store);

    const record = await store.load();
    new Uint8Array(record!.ciphertext)[0] ^= 0xff; // flip a bit → GCM auth fails
    await store.save(record!);

    expect(await consumeSealedSecret(store)).toBeNull();
  });

  it("clearSealedSecret wipes a pending stash", async () => {
    const store = createInMemoryCredentialStore();
    await stashSealedSecret(BLOB, store);
    await clearSealedSecret(store);
    expect(await consumeSealedSecret(store)).toBeNull();
  });
});

/**
 * Behavioural contracts for the device ports of `ClientPlatform`
 * (`platform.ts`) that both clients implement. Each client runs the same
 * suite against its own adapter (web: vitest in clients/web over
 * fake-indexeddb / an in-memory Web Storage; mobile: vitest in
 * clients/mobile with SecureStore, the SQLite key-value store and the file
 * system faked, and expo-sqlite over Node's SQLite), so the two adapters
 * can't drift in what the shared stores rely on.
 *
 * The cases describe what the stores need (kid-store, game-store, vault-store,
 * the registration flow, the companion's outboxes and volume), never how an
 * adapter stores it.
 */

import { describe, expect, it, vi } from "vitest";
import { createDevice, getOrCreateDevice, type DeviceKeystore } from "@dodi/vault";

import type { DeviceStorage, KeyValueStorage, OfflineCache, SealedSecretSlot } from "./platform";

/** How a contract gets instances of the port under test. */
export interface PortHarness<T> {
  /** A fresh instance over empty device storage. */
  create(): T | Promise<T>;
  /**
   * A second instance over the storage of the last `create()`, as after an app
   * restart or a page reload. Omit where the adapter can't be re-created; the
   * persistence cases are then skipped.
   */
  reopen?(): T | Promise<T>;
  /**
   * Everything the adapter wrote to device storage, as text (binary values
   * decoded as UTF-8), for the "never in plaintext" cases. Omit where the
   * storage can't be inspected; those cases are then skipped.
   */
  dumpStorage?(): string | Promise<string>;
  /**
   * Make the device storage under the adapter fail from now on (until the next
   * `create()`), for the best-effort cases. Omit where it can't be broken.
   */
  breakStorage?(): void | Promise<void>;
  /**
   * Titles of contract cases this adapter is known to fail. They run as
   * `it.fails` (so fixing the adapter flips them red until the entry goes).
   * Every entry needs a TODO naming the bug where the harness is defined.
   */
  knownFailures?: readonly string[];
}

type CaseBody = () => Promise<void> | void;

/** `it`, or `it.fails` for a case the adapter is known to fail. */
function caseOf(harness: PortHarness<unknown>): (title: string, body: CaseBody) => void {
  return (title, body) => (harness.knownFailures?.includes(title) ? it.fails : it)(title, body);
}

const KID_A = "6f1c2b3a-4d5e-4f60-8172-93a4b5c6d7e8";
const KID_B = "a9b8c7d6-e5f4-4321-9fed-cba987654321";

/** A secret marker that must never show up in device storage as plaintext. */
const PLAINTEXT_MARKER = "PLAINTEXT-MARKER-7f3a9c";

// ---------------------------------------------------------------------------
// OfflineCache
// ---------------------------------------------------------------------------

function vaultKeysFixture(): Record<string, unknown> {
  return {
    version: 2,
    passwordWrap: { salt: "c2FsdA", nonce: "bm9uY2U", ciphertext: `${PLAINTEXT_MARKER}-wrap` },
    deviceWraps: [{ deviceId: "dev-1", kemCiphertext: "a2Vt", wrapped: "d3JhcA" }],
    npub: null,
  };
}

/** Kid / game rows as the platform returns them: ciphertext fields plus plain metadata. */
function rowsFixture(tag: string): Array<Record<string, unknown>> {
  return [
    { id: `${tag}-1`, name: `enc:v1:${tag}-name-1`, is_favorite: true, birthdate: null, tags: ["a", "b"] },
    { id: `${tag}-2`, name: `enc:v1:${tag}-name-2 ünïcødé`, is_favorite: false, nested: { score: 3 } },
  ];
}

export function describeOfflineCacheContract(name: string, harness: PortHarness<OfflineCache>): void {
  describe(`OfflineCache contract: ${name}`, () => {
    it("misses (null) on a cold cache", async () => {
      const cache = await harness.create();
      await expect(cache.readVaultKeys()).resolves.toBeNull();
      await expect(cache.readKidRows()).resolves.toBeNull();
      await expect(cache.readGameRows(KID_A)).resolves.toBeNull();
    });

    it("round-trips the vault keys", async () => {
      const cache = await harness.create();
      const keys = vaultKeysFixture();
      await cache.writeVaultKeys(keys);
      await expect(cache.readVaultKeys()).resolves.toEqual(keys);
    });

    it("round-trips kid rows exactly as written", async () => {
      const cache = await harness.create();
      const rows = rowsFixture("kid");
      await cache.writeKidRows(rows);
      await expect(cache.readKidRows()).resolves.toEqual(rows);
    });

    it("keeps game rows per kid", async () => {
      const cache = await harness.create();
      await cache.writeGameRows(KID_A, rowsFixture("game-a"));
      await cache.writeGameRows(KID_B, rowsFixture("game-b"));
      await expect(cache.readGameRows(KID_A)).resolves.toEqual(rowsFixture("game-a"));
      await expect(cache.readGameRows(KID_B)).resolves.toEqual(rowsFixture("game-b"));
    });

    it("a later write replaces the earlier rows", async () => {
      const cache = await harness.create();
      await cache.writeKidRows(rowsFixture("old"));
      await cache.writeKidRows(rowsFixture("new").slice(0, 1));
      await expect(cache.readKidRows()).resolves.toEqual(rowsFixture("new").slice(0, 1));
      await cache.writeGameRows(KID_A, rowsFixture("old"));
      await cache.writeGameRows(KID_A, []);
      await expect(cache.readGameRows(KID_A)).resolves.toEqual([]);
    });

    it("an empty list is a hit ([]), not a miss (null)", async () => {
      const cache = await harness.create();
      await cache.writeKidRows([]);
      await cache.writeGameRows(KID_A, []);
      await expect(cache.readKidRows()).resolves.toEqual([]);
      await expect(cache.readGameRows(KID_A)).resolves.toEqual([]);
    });

    it.skipIf(!harness.reopen)("survives a restart (an offline cold start)", async () => {
      const cache = await harness.create();
      await cache.writeVaultKeys(vaultKeysFixture());
      await cache.writeKidRows(rowsFixture("kid"));
      await cache.writeGameRows(KID_A, rowsFixture("game"));
      const reopened = await harness.reopen!();
      await expect(reopened.readVaultKeys()).resolves.toEqual(vaultKeysFixture());
      await expect(reopened.readKidRows()).resolves.toEqual(rowsFixture("kid"));
      await expect(reopened.readGameRows(KID_A)).resolves.toEqual(rowsFixture("game"));
    });

    it.skipIf(!harness.breakStorage)("is best-effort: on a storage failure reads miss and writes resolve", async () => {
      const cache = await harness.create();
      await cache.writeKidRows(rowsFixture("kid"));
      await harness.breakStorage!();
      await expect(cache.writeVaultKeys(vaultKeysFixture())).resolves.toBeUndefined();
      await expect(cache.writeKidRows(rowsFixture("new"))).resolves.toBeUndefined();
      await expect(cache.writeGameRows(KID_A, rowsFixture("game"))).resolves.toBeUndefined();
      await expect(cache.readVaultKeys()).resolves.toBeNull();
      await expect(cache.readKidRows()).resolves.toBeNull();
      await expect(cache.readGameRows(KID_A)).resolves.toBeNull();
    });

    it.skipIf(!harness.dumpStorage)("never stores the vault keys in plaintext", async () => {
      const cache = await harness.create();
      await cache.writeVaultKeys(vaultKeysFixture());
      await expect(cache.readVaultKeys()).resolves.toEqual(vaultKeysFixture());
      const dump = await harness.dumpStorage!();
      expect(dump).not.toContain(PLAINTEXT_MARKER);
      expect(dump).not.toContain("passwordWrap");
    });
  });
}

// ---------------------------------------------------------------------------
// DeviceKeystore (the device's ML-KEM / ML-DSA identity)
// ---------------------------------------------------------------------------

export function describeDeviceKeystoreContract(name: string, harness: PortHarness<DeviceKeystore>): void {
  describe(`DeviceKeystore contract: ${name}`, () => {
    it("load resolves null before a device was saved", async () => {
      const keystore = await harness.create();
      await expect(keystore.load()).resolves.toBeNull();
    });

    it("load returns the saved device with byte-identical Uint8Array keys", async () => {
      const keystore = await harness.create();
      const device = createDevice();
      await keystore.save(device);
      const loaded = await keystore.load();
      expect(loaded?.deviceId).toBe(device.deviceId);
      for (const pair of ["kem", "sign"] as const) {
        for (const part of ["publicKey", "secretKey"] as const) {
          const bytes = loaded?.[pair][part];
          expect(bytes).toBeInstanceOf(Uint8Array);
          expect(Array.from(bytes!)).toEqual(Array.from(device[pair][part]));
        }
      }
    });

    it("a later save replaces the device", async () => {
      const keystore = await harness.create();
      await keystore.save(createDevice());
      const next = createDevice();
      await keystore.save(next);
      await expect(keystore.load()).resolves.toMatchObject({ deviceId: next.deviceId });
    });

    it("clear forgets the device (and resolves when there is none)", async () => {
      const keystore = await harness.create();
      await expect(keystore.clear()).resolves.toBeUndefined();
      await keystore.save(createDevice());
      await keystore.clear();
      await expect(keystore.load()).resolves.toBeNull();
    });

    it("getOrCreateDevice creates once and then keeps returning that device", async () => {
      const keystore = await harness.create();
      const first = await getOrCreateDevice(keystore);
      const second = await getOrCreateDevice(keystore);
      expect(second.deviceId).toBe(first.deviceId);
    });

    it.skipIf(!harness.reopen)("survives a restart (the silent re-unlock)", async () => {
      const keystore = await harness.create();
      const device = createDevice();
      await keystore.save(device);
      const loaded = await (await harness.reopen!()).load();
      expect(loaded?.deviceId).toBe(device.deviceId);
      expect(Array.from(loaded!.kem.secretKey)).toEqual(Array.from(device.kem.secretKey));
    });
  });
}

// ---------------------------------------------------------------------------
// SealedSecretSlot (the registration seal)
// ---------------------------------------------------------------------------

/** The size of the real payload: stored vault keys (post-quantum wraps) + the nsec. */
function registrationSecret(tag: string): string {
  return JSON.stringify({
    tag,
    marker: PLAINTEXT_MARKER,
    storedKeys: { wrap: "x".repeat(6000) },
    nsec: "nsec1ünïcødé",
  });
}

/**
 * The slot holds a registration's vault across the email-code round trip
 * only: an abandoned stash must not stay usable past the code's lifetime
 * (the platform's sign-up codes expire after an hour).
 */
export const SEALED_SECRET_EXPIRES =
  "does not hand out a secret stashed longer ago than the email code lives (over an hour)";

export function describeSealedSecretSlotContract(name: string, harness: PortHarness<SealedSecretSlot>): void {
  const test = caseOf(harness);
  describe(`SealedSecretSlot contract: ${name}`, () => {
    it("consume resolves null when nothing was stashed", async () => {
      const slot = await harness.create();
      await expect(slot.consume()).resolves.toBeNull();
    });

    it("consume returns the stashed secret (several KB, unicode) exactly", async () => {
      const slot = await harness.create();
      await slot.stash(registrationSecret("one"));
      await expect(slot.consume()).resolves.toBe(registrationSecret("one"));
    });

    it("is single-use: a second consume resolves null", async () => {
      const slot = await harness.create();
      await slot.stash(registrationSecret("once"));
      await slot.consume();
      await expect(slot.consume()).resolves.toBeNull();
    });

    it("a later stash replaces the earlier secret", async () => {
      const slot = await harness.create();
      await slot.stash(registrationSecret("old"));
      await slot.stash(registrationSecret("new"));
      await expect(slot.consume()).resolves.toBe(registrationSecret("new"));
    });

    it("clear wipes the secret (and resolves when there is none)", async () => {
      const slot = await harness.create();
      await expect(slot.clear()).resolves.toBeUndefined();
      await slot.stash(registrationSecret("wiped"));
      await slot.clear();
      await expect(slot.consume()).resolves.toBeNull();
    });

    test(SEALED_SECRET_EXPIRES, async () => {
      const slot = await harness.create();
      // Only Date is faked: storage callbacks keep running on real timers.
      vi.useFakeTimers({ toFake: ["Date"], now: Date.now() });
      try {
        await slot.stash(registrationSecret("abandoned"));
        vi.setSystemTime(Date.now() + 2 * 60 * 60 * 1000);
        await expect(slot.consume()).resolves.toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it.skipIf(!harness.reopen)("survives a restart until consumed", async () => {
      const slot = await harness.create();
      await slot.stash(registrationSecret("kept"));
      const reopened = await harness.reopen!();
      await expect(reopened.consume()).resolves.toBe(registrationSecret("kept"));
      await expect((await harness.reopen!()).consume()).resolves.toBeNull();
    });

    it.skipIf(!harness.dumpStorage)("never stores the secret in plaintext", async () => {
      const slot = await harness.create();
      await slot.stash(registrationSecret("sealed"));
      const dump = await harness.dumpStorage!();
      expect(dump).not.toContain(PLAINTEXT_MARKER);
      await expect(slot.consume()).resolves.toBe(registrationSecret("sealed"));
    });
  });
}

// ---------------------------------------------------------------------------
// KeyValueStorage (device preferences) and DeviceStorage (outboxes, markers)
// ---------------------------------------------------------------------------

function describeKeyValueCases(harness: PortHarness<KeyValueStorage>): void {
  it("getItem returns null (not undefined) for a key never set", async () => {
    const storage = await harness.create();
    expect(storage.getItem("dodi-contract-missing")).toBeNull();
  });

  it("getItem returns what setItem stored, and a later setItem replaces it", async () => {
    const storage = await harness.create();
    storage.setItem("dodi-companion-volume-kid", "0.4");
    expect(storage.getItem("dodi-companion-volume-kid")).toBe("0.4");
    storage.setItem("dodi-companion-volume-kid", "1");
    expect(storage.getItem("dodi-companion-volume-kid")).toBe("1");
  });

  it("keeps keys independent", async () => {
    const storage = await harness.create();
    storage.setItem("dodi-a", "1");
    storage.setItem("dodi-b", "2");
    expect(storage.getItem("dodi-a")).toBe("1");
    expect(storage.getItem("dodi-b")).toBe("2");
  });

  it("round-trips JSON outbox values and the empty string unchanged", async () => {
    const storage = await harness.create();
    const json = JSON.stringify({ kidId: KID_A, lines: ["hällo", "👋", 'quote "x"'], at: 1 });
    storage.setItem("dodi-outbox", json);
    storage.setItem("dodi-empty", "");
    expect(storage.getItem("dodi-outbox")).toBe(json);
    expect(storage.getItem("dodi-empty")).toBe("");
  });

  it.skipIf(!harness.reopen)("survives a restart", async () => {
    const storage = await harness.create();
    storage.setItem("dodi-kept", "yes");
    expect((await harness.reopen!()).getItem("dodi-kept")).toBe("yes");
  });
}

export function describeKeyValueStorageContract(name: string, harness: PortHarness<KeyValueStorage>): void {
  describe(`KeyValueStorage contract: ${name}`, () => {
    describeKeyValueCases(harness);
  });
}

export function describeDeviceStorageContract(name: string, harness: PortHarness<DeviceStorage>): void {
  describe(`DeviceStorage contract: ${name}`, () => {
    describeKeyValueCases(harness);

    it("removeItem deletes the key and leaves the others", async () => {
      const storage = await harness.create();
      storage.setItem("dodi-a", "1");
      storage.setItem("dodi-b", "2");
      storage.removeItem("dodi-a");
      expect(storage.getItem("dodi-a")).toBeNull();
      expect(storage.getItem("dodi-b")).toBe("2");
    });

    it("removeItem of a key never set does not throw", async () => {
      const storage = await harness.create();
      expect(() => storage.removeItem("dodi-contract-missing")).not.toThrow();
    });
  });
}

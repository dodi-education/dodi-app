import { describe, expect, it } from "vitest";

import {
  type Argon2Params,
  constantTimeEqual,
  toBase64Url,
  unwrapKeyWithPassword,
} from "@dodi/crypto";

import {
  type StoredDevice,
  createAccountVault,
  createDevice,
  createInMemoryDeviceKeystore,
  getOrCreateDevice,
  unlockVaultWithDevice,
} from "./index";
import { VaultSession } from "./session";

const TEST_ARGON2: Argon2Params = { t: 2, m: 8192, p: 1, dkLen: 32 };

function vaultForDevice(device: StoredDevice, password = "pw") {
  return createAccountVault({
    password,
    device: {
      deviceId: device.deviceId,
      deviceKemPublicKey: toBase64Url(device.kem.publicKey),
    },
    argon2Params: TEST_ARGON2,
  });
}

describe("device keystore", () => {
  it("createDevice yields a unique id and valid PQ keypairs", () => {
    const a = createDevice();
    const b = createDevice();
    expect(a.deviceId).not.toBe(b.deviceId);
    expect(a.kem.publicKey.length).toBe(1184); // ML-KEM-768 pk
    expect(a.sign.publicKey.length).toBe(1952); // ML-DSA-65 pk
  });

  it("getOrCreateDevice persists then returns the same device", async () => {
    const ks = createInMemoryDeviceKeystore();
    const first = await getOrCreateDevice(ks);
    const second = await getOrCreateDevice(ks);
    expect(second.deviceId).toBe(first.deviceId);
    expect(await ks.load()).not.toBeNull();
  });

  it("clear wipes the stored device", async () => {
    const ks = createInMemoryDeviceKeystore();
    await getOrCreateDevice(ks);
    await ks.clear();
    expect(await ks.load()).toBeNull();
  });

  it("a keystore device can silently unlock its account vault", () => {
    const device = createDevice();
    const vault = vaultForDevice(device);
    const unlocked = unlockVaultWithDevice(
      vault.storedKeys,
      device.deviceId,
      device.kem.secretKey,
    );
    expect(constantTimeEqual(unlocked, vault.vmk)).toBe(true);
  });
});

describe("VaultSession", () => {
  const vault = vaultForDevice(createDevice());
  const session = new VaultSession(vault.vmk);

  it("round-trips a field", () => {
    const enc = session.encryptField("Emma loves dinosaurs 🦕");
    expect(enc.startsWith("enc:v1:")).toBe(true);
    expect(session.decryptField(enc)).toBe("Emma loves dinosaurs 🦕");
  });

  it("passes through null and legacy plaintext", () => {
    expect(session.decryptField(null)).toBeNull();
    expect(session.decryptField(undefined)).toBeNull();
    expect(session.decryptField("legacy plaintext")).toBe("legacy plaintext");
  });

  it("round-trips JSON", () => {
    const enc = session.encryptJson({ color: "teal", accessories: ["hat"] });
    expect(session.decryptJson<{ color: string }>(enc)?.color).toBe("teal");
  });

  it("a locked session refuses encrypted ops but still passes through plaintext", () => {
    const s = new VaultSession(vault.vmk.slice());
    const enc = s.encryptField("secret");
    s.lock();
    expect(s.locked).toBe(true);
    expect(() => s.encryptField("x")).toThrow();
    expect(() => s.decryptField(enc)).toThrow();
    expect(s.decryptField(null)).toBeNull();
    expect(s.decryptField("plain")).toBe("plain");
  });

  it("rewrapPassword yields a wrap the new password can unlock (device-session reset)", () => {
    const s = new VaultSession(vault.vmk.slice());
    const wrap = s.rewrapPassword("brand-new-pw", TEST_ARGON2);
    expect(constantTimeEqual(unwrapKeyWithPassword("brand-new-pw", wrap), vault.vmk)).toBe(true);
  });

  it("rewrapPassword throws on a locked session", () => {
    const s = new VaultSession(vault.vmk.slice());
    s.lock();
    expect(() => s.rewrapPassword("x", TEST_ARGON2)).toThrow();
  });
});

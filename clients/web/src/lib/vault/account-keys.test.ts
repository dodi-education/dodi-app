import { describe, expect, it } from "vitest";

import {
  type Argon2Params,
  constantTimeEqual,
  generateKemKeyPair,
  toBase64Url,
} from "@dodi/crypto";

import {
  type DeviceRegistration,
  addDeviceToVault,
  changeVaultPassword,
  createAccountVault,
  removeDeviceFromVault,
  resetVaultPasswordWithPhrase,
  setVaultPassword,
  unlockVaultWithDevice,
  unlockVaultWithPassword,
  unlockVaultWithPhrase,
} from "./account-keys";

const TEST_ARGON2: Argon2Params = { t: 2, m: 8192, p: 1, dkLen: 32 };

function newDevice(id: string): { reg: DeviceRegistration; secretKey: Uint8Array } {
  const kp = generateKemKeyPair();
  return {
    reg: { deviceId: id, deviceKemPublicKey: toBase64Url(kp.publicKey) },
    secretKey: kp.secretKey,
  };
}

function bootstrap(password = "parent-pw") {
  const device = newDevice("device-1");
  const vault = createAccountVault({
    password,
    device: device.reg,
    argon2Params: TEST_ARGON2,
  });
  return { device, vault };
}

describe("account vault bootstrap", () => {
  it("creates a valid phrase, vmk, and stored wraps", () => {
    const { vault } = bootstrap();
    expect(vault.backupPhrase.split(" ")).toHaveLength(12);
    expect(vault.vmk).toHaveLength(32);
    expect(vault.storedKeys.passwordWrap).not.toBeNull();
    expect(vault.storedKeys.deviceWraps).toHaveLength(1);
  });
});

describe("vault unlock paths recover the same VMK", () => {
  it("password unlock", () => {
    const { vault } = bootstrap("hunter2");
    expect(
      constantTimeEqual(unlockVaultWithPassword(vault.storedKeys, "hunter2"), vault.vmk),
    ).toBe(true);
  });

  it("wrong password fails", () => {
    const { vault } = bootstrap("hunter2");
    expect(() => unlockVaultWithPassword(vault.storedKeys, "nope")).toThrow();
  });

  it("device unlock (silent re-unlock)", () => {
    const { device, vault } = bootstrap();
    expect(
      constantTimeEqual(
        unlockVaultWithDevice(vault.storedKeys, "device-1", device.secretKey),
        vault.vmk,
      ),
    ).toBe(true);
  });

  it("unknown device fails", () => {
    const { vault } = bootstrap();
    const other = newDevice("ghost");
    expect(() => unlockVaultWithDevice(vault.storedKeys, "ghost", other.secretKey)).toThrow();
  });

  it("backup phrase recovery", () => {
    const { vault } = bootstrap();
    expect(
      constantTimeEqual(
        unlockVaultWithPhrase(vault.storedKeys, vault.backupPhrase),
        vault.vmk,
      ),
    ).toBe(true);
  });

  it("a wrong (but valid) phrase is rejected via vmkCheck", () => {
    const { vault } = bootstrap();
    const otherPhrase = createAccountVault({
      password: "x",
      device: newDevice("d2").reg,
      argon2Params: TEST_ARGON2,
    }).backupPhrase;
    expect(() => unlockVaultWithPhrase(vault.storedKeys, otherPhrase)).toThrow();
  });
});

describe("device management", () => {
  it("adds a second device that can unlock the same VMK", () => {
    const { vault } = bootstrap();
    const second = newDevice("device-2");
    const updated = addDeviceToVault(vault.storedKeys, vault.vmk, second.reg);
    expect(updated.deviceWraps).toHaveLength(2);
    expect(
      constantTimeEqual(
        unlockVaultWithDevice(updated, "device-2", second.secretKey),
        vault.vmk,
      ),
    ).toBe(true);
  });

  it("re-adding the same deviceId replaces, not duplicates", () => {
    const { device, vault } = bootstrap();
    const updated = addDeviceToVault(vault.storedKeys, vault.vmk, device.reg);
    expect(updated.deviceWraps).toHaveLength(1);
  });

  it("removed device can no longer unlock", () => {
    const { device, vault } = bootstrap();
    const updated = removeDeviceFromVault(vault.storedKeys, "device-1");
    expect(updated.deviceWraps).toHaveLength(0);
    expect(() => unlockVaultWithDevice(updated, "device-1", device.secretKey)).toThrow();
  });
});

describe("password change & reset keep the same VMK", () => {
  it("change password: new unlocks, old fails, vmk unchanged", () => {
    const { vault } = bootstrap("old-pw");
    const updated = changeVaultPassword(vault.storedKeys, "old-pw", "new-pw", TEST_ARGON2);
    expect(constantTimeEqual(unlockVaultWithPassword(updated, "new-pw"), vault.vmk)).toBe(true);
    expect(() => unlockVaultWithPassword(updated, "old-pw")).toThrow();
  });

  it("reset via phrase: new password unlocks the same vmk", () => {
    const { vault } = bootstrap("forgotten");
    const updated = resetVaultPasswordWithPhrase(
      vault.storedKeys,
      vault.backupPhrase,
      "fresh-pw",
      TEST_ARGON2,
    );
    expect(constantTimeEqual(unlockVaultWithPassword(updated, "fresh-pw"), vault.vmk)).toBe(true);
    // existing device wrap still works (VMK is unchanged)
  });

  it("reset via phrase rejects a wrong (but valid) phrase via vmkCheck", () => {
    // A wrong-but-checksum-valid phrase must NOT silently re-wrap the password
    // around a foreign VMK (which would corrupt access). It must throw.
    const { vault } = bootstrap("forgotten");
    const foreignPhrase = createAccountVault({
      password: "x",
      device: newDevice("d2").reg,
      argon2Params: TEST_ARGON2,
    }).backupPhrase;
    expect(() =>
      resetVaultPasswordWithPhrase(vault.storedKeys, foreignPhrase, "fresh-pw", TEST_ARGON2),
    ).toThrow();
  });
});

describe("setVaultPassword (device-session reset)", () => {
  it("re-wraps from an in-memory vmk; new password unlocks the same vmk", () => {
    const { vault } = bootstrap();
    const updated = setVaultPassword(vault.storedKeys, vault.vmk, "device-set-pw", TEST_ARGON2);
    expect(
      constantTimeEqual(unlockVaultWithPassword(updated, "device-set-pw"), vault.vmk),
    ).toBe(true);
  });

  it("leaves device wraps and vmkCheck untouched (only the password wrap rotates)", () => {
    const { device, vault } = bootstrap();
    const updated = setVaultPassword(vault.storedKeys, vault.vmk, "device-set-pw", TEST_ARGON2);
    expect(updated.deviceWraps).toEqual(vault.storedKeys.deviceWraps);
    expect(updated.vmkCheck).toBe(vault.storedKeys.vmkCheck);
    expect(
      constantTimeEqual(
        unlockVaultWithDevice(updated, "device-1", device.secretKey),
        vault.vmk,
      ),
    ).toBe(true);
  });
});

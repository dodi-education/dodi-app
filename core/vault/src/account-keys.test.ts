import { describe, expect, it } from "vitest";

import {
  type Argon2Params,
  constantTimeEqual,
  generateKemKeyPair,
  nsecToNpubHex,
  toBase64Url,
} from "@dodi/crypto";

import {
  type DeviceRegistration,
  addDeviceToVault,
  changeVaultPassword,
  createAccountVault,
  removeDeviceFromVault,
  resetVaultPasswordWithNsec,
  setVaultPassword,
  unlockVaultWithDevice,
  unlockVaultWithNsec,
  unlockVaultWithPassword,
} from "./account-keys";

const TEST_ARGON2: Argon2Params = { t: 2, m: 8192, p: 1, dkLen: 32 };

function newDevice(id: string): { reg: DeviceRegistration; secretKey: Uint8Array } {
  const kp = generateKemKeyPair();
  return {
    reg: { deviceId: id, deviceKemPublicKey: toBase64Url(kp.publicKey) },
    secretKey: kp.secretKey,
  };
}

async function bootstrap(password = "parent-pw") {
  const device = newDevice("device-1");
  const vault = await createAccountVault({
    password,
    device: device.reg,
    argon2Params: TEST_ARGON2,
  });
  return { device, vault };
}

describe("account vault bootstrap", () => {
  it("creates a valid nsec, npub, vmk, and stored wraps", async () => {
    const { vault } = await bootstrap();
    expect(vault.nsec.startsWith("nsec1")).toBe(true);
    expect(vault.npubHex).toMatch(/^[0-9a-f]{64}$/);
    expect(vault.vmk).toHaveLength(32);
    expect(vault.storedKeys.passwordWrap).not.toBeNull();
    expect(vault.storedKeys.deviceWraps).toHaveLength(1);
  });

  it("imports an existing nsec (bech32 or hex) and normalizes it", async () => {
    const { vault: source } = await bootstrap();
    const asHex = nsecToNpubHex(source.nsec); // sanity: derived npub is stable
    for (const importedNsec of [source.nsec, source.nsec.toUpperCase()]) {
      const vault = await createAccountVault({
        password: "other-pw",
        device: newDevice("d-import").reg,
        argon2Params: TEST_ARGON2,
        importedNsec,
      });
      expect(vault.nsec).toBe(source.nsec);
      expect(vault.npubHex).toBe(asHex);
      // Same root → same VMK: the imported key unlocks the new vault.
      expect(
        constantTimeEqual(unlockVaultWithNsec(vault.storedKeys, source.nsec), source.vmk),
      ).toBe(true);
    }
  });
});

describe("vault unlock paths recover the same VMK", () => {
  it("password unlock", async () => {
    const { vault } = await bootstrap("hunter2");
    expect(
      constantTimeEqual(await unlockVaultWithPassword(vault.storedKeys, "hunter2"), vault.vmk),
    ).toBe(true);
  });

  it("wrong password fails", async () => {
    const { vault } = await bootstrap("hunter2");
    await expect(unlockVaultWithPassword(vault.storedKeys, "nope")).rejects.toThrow();
  });

  it("device unlock (silent re-unlock)", async () => {
    const { device, vault } = await bootstrap();
    expect(
      constantTimeEqual(
        unlockVaultWithDevice(vault.storedKeys, "device-1", device.secretKey),
        vault.vmk,
      ),
    ).toBe(true);
  });

  it("unknown device fails", async () => {
    const { vault } = await bootstrap();
    const other = newDevice("ghost");
    expect(() => unlockVaultWithDevice(vault.storedKeys, "ghost", other.secretKey)).toThrow();
  });

  it("nsec recovery", async () => {
    const { vault } = await bootstrap();
    expect(
      constantTimeEqual(
        unlockVaultWithNsec(vault.storedKeys, vault.nsec),
        vault.vmk,
      ),
    ).toBe(true);
  });

  it("a wrong (but valid) nsec is rejected via vmkCheck", async () => {
    const { vault } = await bootstrap();
    const otherNsec = (
      await createAccountVault({
        password: "x",
        device: newDevice("d2").reg,
        argon2Params: TEST_ARGON2,
      })
    ).nsec;
    expect(() => unlockVaultWithNsec(vault.storedKeys, otherNsec)).toThrow();
  });
});

describe("device management", () => {
  it("adds a second device that can unlock the same VMK", async () => {
    const { vault } = await bootstrap();
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

  it("re-adding the same deviceId replaces, not duplicates", async () => {
    const { device, vault } = await bootstrap();
    const updated = addDeviceToVault(vault.storedKeys, vault.vmk, device.reg);
    expect(updated.deviceWraps).toHaveLength(1);
  });

  it("removed device can no longer unlock", async () => {
    const { device, vault } = await bootstrap();
    const updated = removeDeviceFromVault(vault.storedKeys, "device-1");
    expect(updated.deviceWraps).toHaveLength(0);
    expect(() => unlockVaultWithDevice(updated, "device-1", device.secretKey)).toThrow();
  });
});

describe("password change & reset keep the same VMK", () => {
  it("change password: new unlocks, old fails, vmk unchanged", async () => {
    const { vault } = await bootstrap("old-pw");
    const updated = await changeVaultPassword(vault.storedKeys, "old-pw", "new-pw", TEST_ARGON2);
    expect(constantTimeEqual(await unlockVaultWithPassword(updated, "new-pw"), vault.vmk)).toBe(true);
    await expect(unlockVaultWithPassword(updated, "old-pw")).rejects.toThrow();
  });

  it("reset via nsec: new password unlocks the same vmk", async () => {
    const { vault } = await bootstrap("forgotten");
    const updated = await resetVaultPasswordWithNsec(
      vault.storedKeys,
      vault.nsec,
      "fresh-pw",
      TEST_ARGON2,
    );
    expect(
      constantTimeEqual(await unlockVaultWithPassword(updated, "fresh-pw"), vault.vmk),
    ).toBe(true);
    // existing device wrap still works (VMK is unchanged)
  });

  it("reset via nsec rejects a wrong (but valid) nsec via vmkCheck", async () => {
    // A wrong-but-valid nsec must NOT silently re-wrap the password around a
    // foreign VMK (which would corrupt access). It must throw.
    const { vault } = await bootstrap("forgotten");
    const foreignNsec = (
      await createAccountVault({
        password: "x",
        device: newDevice("d2").reg,
        argon2Params: TEST_ARGON2,
      })
    ).nsec;
    await expect(
      resetVaultPasswordWithNsec(vault.storedKeys, foreignNsec, "fresh-pw", TEST_ARGON2),
    ).rejects.toThrow();
  });
});

describe("setVaultPassword (device-session reset)", () => {
  it("re-wraps from an in-memory vmk; new password unlocks the same vmk", async () => {
    const { vault } = await bootstrap();
    const updated = await setVaultPassword(vault.storedKeys, vault.vmk, "device-set-pw", TEST_ARGON2);
    expect(
      constantTimeEqual(await unlockVaultWithPassword(updated, "device-set-pw"), vault.vmk),
    ).toBe(true);
  });

  it("leaves device wraps and vmkCheck untouched (only the password wrap rotates)", async () => {
    const { device, vault } = await bootstrap();
    const updated = await setVaultPassword(vault.storedKeys, vault.vmk, "device-set-pw", TEST_ARGON2);
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

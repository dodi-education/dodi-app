import { describe, expect, it } from "vitest";

import { type Argon2Params, constantTimeEqual, generateKemKeyPair, toBase64Url } from "@dodi/crypto";

import { createAccountVault, unlockVaultWithDevice, unlockVaultWithPassword } from "./account-keys";
import {
  createInviteWrap,
  createUserKeys,
  isUserKeyFor,
  openInviteWrap,
  openMemberVaultKey,
  wrapVaultKeyForMember,
} from "./member-keys";
import { VaultSession } from "./session";

const TEST_ARGON2: Argon2Params = { t: 2, m: 8192, p: 1, dkLen: 32 };

function newDevice(id: string) {
  const kp = generateKemKeyPair();
  return { reg: { deviceId: id, deviceKemPublicKey: toBase64Url(kp.publicKey) }, secretKey: kp.secretKey };
}

async function family() {
  return createAccountVault({ password: "owner-pw", device: newDevice("owner").reg, argon2Params: TEST_ARGON2 });
}

describe("personal keys", () => {
  it("unlock with the login's password or device, like a family vault", async () => {
    const device = newDevice("member-phone");
    const { seed, userKeys } = await createUserKeys({
      password: "member-pw",
      device: device.reg,
      argon2Params: TEST_ARGON2,
    });
    const viaPassword = await unlockVaultWithPassword(userKeys.vaultKeys, "member-pw");
    const viaDevice = unlockVaultWithDevice(userKeys.vaultKeys, "member-phone", device.secretKey);
    expect(constantTimeEqual(viaPassword, seed)).toBe(true);
    expect(constantTimeEqual(viaDevice, seed)).toBe(true);
    expect(isUserKeyFor(userKeys, seed)).toBe(true);
  });

  it("open the family's key wrapped to them, checked against the family", async () => {
    const owner = await family();
    const { seed, userKeys } = await createUserKeys({
      password: "member-pw",
      device: newDevice("d").reg,
      argon2Params: TEST_ARGON2,
    });
    const wrap = new VaultSession(owner.vmk).wrapForMember(userKeys.kemPublicKey);
    const vmk = openMemberVaultKey(seed, wrap, owner.storedKeys.vmkCheck);
    expect(constantTimeEqual(vmk, owner.vmk)).toBe(true);
  });

  it("reject a wrap of another family's key", async () => {
    const owner = await family();
    const other = await family();
    const { seed, userKeys } = await createUserKeys({
      password: "member-pw",
      device: newDevice("d").reg,
      argon2Params: TEST_ARGON2,
    });
    const wrap = wrapVaultKeyForMember(other.vmk, userKeys.kemPublicKey);
    expect(() => openMemberVaultKey(seed, wrap, owner.storedKeys.vmkCheck)).toThrow();
  });
});

describe("invitations", () => {
  it("hand the family's key over through the link secret", async () => {
    const owner = await family();
    const invite = new VaultSession(owner.vmk).createInvite();
    const vmk = openInviteWrap(invite.secret, invite.sealed, owner.storedKeys.vmkCheck);
    expect(constantTimeEqual(vmk, owner.vmk)).toBe(true);
  });

  it("fail with a wrong or truncated secret", async () => {
    const owner = await family();
    const invite = createInviteWrap(owner.vmk);
    const wrong = createInviteWrap(owner.vmk).secret;
    expect(() => openInviteWrap(wrong, invite.sealed, owner.storedKeys.vmkCheck)).toThrow(
      "This invitation link is incomplete",
    );
    expect(() =>
      openInviteWrap(invite.secret.slice(0, 20), invite.sealed, owner.storedKeys.vmkCheck),
    ).toThrow("This invitation link is incomplete");
  });

  it("fail when the server swapped in another family's sealed key", async () => {
    const owner = await family();
    const other = await family();
    const invite = createInviteWrap(other.vmk);
    expect(() => openInviteWrap(invite.secret, invite.sealed, owner.storedKeys.vmkCheck)).toThrow();
  });
});

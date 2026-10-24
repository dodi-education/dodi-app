/**
 * Inviting and joining, end to end through the real crypto with a fake
 * platform: the platform only ever sees the sealed key (never the link
 * secret), and the invited person ends up with the family's key, wrapped to
 * their own personal key.
 */
import { describe, expect, it, vi } from "vitest";

import { concatBytes, constantTimeEqual, setArgon2idExecutor, sha256Digest } from "@dodi/crypto";
import {
  type DeviceKeystore,
  type StoredDevice,
  type StoredUserKeys,
  VaultSession,
  createAccountVault,
  getOrCreateDevice,
  openMemberVaultKey,
  unlockVaultWithPassword,
} from "@dodi/vault";
import { toBase64Url } from "@dodi/crypto";

import {
  createFamilyInvite,
  inviteMailtoHref,
  inviteSecretFromHash,
  joinFamily,
} from "./family-members";
import type { PlatformApi } from "./platform";
import type { VaultStore } from "./vault-store";

// A cheap stand-in for Argon2id: these tests are about the key handover, not
// the password KDF (covered in @dodi/crypto).
setArgon2idExecutor(async (password, salt) => sha256Digest(concatBytes(password, salt)));

function memoryKeystore(): DeviceKeystore {
  let device: StoredDevice | null = null;
  return {
    load: async () => device,
    save: async (next) => {
      device = next;
    },
    clear: async () => {
      device = null;
    },
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** A fake platform holding one invitation, recording every request body. */
function fakePlatform(familyVmkCheck: string) {
  const bodies: string[] = [];
  const state: { sealed?: string; accepted?: { userKeys?: StoredUserKeys; memberVmkWrap: unknown } } = {};
  const api: PlatformApi = {
    getVaultKeys: async () => null,
    putVaultKeys: async () => {},
    request: async (path, init) => {
      if (typeof init?.body === "string") bodies.push(init.body);
      if (path === "/api/account/invitations" && init?.method === "POST") {
        state.sealed = (JSON.parse(init.body as string) as { vmkInviteWrap: string }).vmkInviteWrap;
        return json({ id: "inv-1", expiresAt: "2026-11-01T00:00:00.000Z" }, 201);
      }
      if (path === "/api/invitations/inv-1/key") {
        return json({ vmkInviteWrap: state.sealed, familyVmkCheck });
      }
      if (path === "/api/user-keys") return json({ userKeys: null });
      if (path === "/api/invitations/inv-1/accept") {
        state.accepted = JSON.parse(init?.body as string);
        return json({ accountId: "family-1", role: "co_parent" });
      }
      return json({ error: "unexpected" }, 500);
    },
  };
  return { api, bodies, state };
}

function vaultWith(session: VaultSession | null) {
  const adopt = vi.fn();
  const vault = {
    getState: () => ({ session, adoptMemberVault: adopt }),
  } as unknown as VaultStore;
  return { vault, adopt };
}

describe("inviting and joining a family", () => {
  it("hands the family's key to the invited login without the server seeing the secret", async () => {
    const ownerDevice = await getOrCreateDevice(memoryKeystore());
    const family = await createAccountVault({
      password: "owner-password",
      device: { deviceId: ownerDevice.deviceId, deviceKemPublicKey: toBase64Url(ownerDevice.kem.publicKey) },
    });
    const platform = fakePlatform(family.storedKeys.vmkCheck);

    const invite = await createFamilyInvite(
      { api: platform.api, vault: vaultWith(new VaultSession(family.vmk)).vault },
      { email: "grandma@example.com", role: "co_parent", appUrl: "https://app.dodi.app/" },
    );
    if (invite.kind !== "created") throw new Error("invite failed");
    expect(invite.link).toMatch(/^https:\/\/app\.dodi\.app\/join\/inv-1#k=/);
    const secret = inviteSecretFromHash(new URL(invite.link).hash);
    expect(secret).not.toBeNull();
    // The secret never went to the platform.
    expect(platform.bodies.some((body) => body.includes(secret as string))).toBe(false);

    const invitee = vaultWith(null);
    const dropFamilyData = vi.fn(async () => {});
    const joined = await joinFamily(
      { api: platform.api, vault: invitee.vault, deviceKeystore: memoryKeystore(), dropFamilyData },
      { invitationId: "inv-1", secret: secret as string, password: "grandma-password" },
    );
    expect(joined).toEqual({ kind: "joined", accountId: "family-1" });
    expect(dropFamilyData).toHaveBeenCalledOnce();

    // The accepted personal key opens with the invitee's password, and the
    // wrap it carries opens the family's key.
    const accepted = platform.state.accepted;
    if (!accepted?.userKeys) throw new Error("no keys accepted");
    const seed = await unlockVaultWithPassword(accepted.userKeys.vaultKeys, "grandma-password");
    const vmk = openMemberVaultKey(seed, accepted.memberVmkWrap as never, family.storedKeys.vmkCheck);
    expect(constantTimeEqual(vmk, family.vmk)).toBe(true);
    const [adoptedVmk] = invitee.adopt.mock.calls[0] as [Uint8Array, Uint8Array];
    expect(constantTimeEqual(adoptedVmk, family.vmk)).toBe(true);
  });

  it("refuses a link whose secret was cut off or changed", async () => {
    const ownerDevice = await getOrCreateDevice(memoryKeystore());
    const family = await createAccountVault({
      password: "owner-password",
      device: { deviceId: ownerDevice.deviceId, deviceKemPublicKey: toBase64Url(ownerDevice.kem.publicKey) },
    });
    const platform = fakePlatform(family.storedKeys.vmkCheck);
    await createFamilyInvite(
      { api: platform.api, vault: vaultWith(new VaultSession(family.vmk)).vault },
      { email: "x@example.com", role: "co_parent", appUrl: "https://app.dodi.app" },
    );
    const outcome = await joinFamily(
      {
        api: platform.api,
        vault: vaultWith(null).vault,
        deviceKeystore: memoryKeystore(),
        dropFamilyData: async () => {},
      },
      { invitationId: "inv-1", secret: "A".repeat(43), password: "pw-12345678" },
    );
    expect(outcome).toEqual({ kind: "error", key: "joinLinkIncomplete" });
    expect(platform.state.accepted).toBeUndefined();
  });

  it("reads the secret only from a well-formed fragment", () => {
    expect(inviteSecretFromHash("#k=abcdefghijklmnopqrstuvwxyz_-0123")).toBe("abcdefghijklmnopqrstuvwxyz_-0123");
    expect(inviteSecretFromHash("")).toBeNull();
    expect(inviteSecretFromHash("#k=short")).toBeNull();
    expect(inviteSecretFromHash("#k=has spaces in it but long enough")).toBeNull();
  });

  it("builds a mailto link the mail app can open", () => {
    expect(
      inviteMailtoHref({ to: "grandma@example.com", subject: "Join us", body: "Hi!\nhttps://x/join/1#k=abc" }),
    ).toBe("mailto:grandma%40example.com?subject=Join%20us&body=Hi%21%0Ahttps%3A%2F%2Fx%2Fjoin%2F1%23k%3Dabc");
  });
});

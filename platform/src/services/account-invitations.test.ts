import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { StoredUserKeys } from "@dodi/vault";

import { PLACEHOLDER_MEMBER_WRAP, createTestDb, type TestDatabase } from "../test-support/pglite-db";
import { deleteAccount, deleteLogin } from "./account-deletion";
import {
  acceptInvitation,
  createInvitation,
  getInvitationKey,
  getInvitationPreview,
  isInvitationOpenFor,
  listPendingInvitations,
  revokeInvitation,
} from "./account-invitations";
import {
  createFamily,
  listFamiliesForUser,
  listMembers,
  removeMember,
  resolveActiveMembership,
  setActiveFamily,
  updateMemberAccess,
} from "./account-members";
import { getUserKeys } from "./user-keys";

/**
 * Invitations: the inviter stores only the sealed key; the invited login
 * (verified, same address) joins with its personal key and the VMK wrapped to
 * it. Links are single-use, expire, can be cancelled, and a new invitation to
 * the same address replaces the old one.
 */

const VAULT = {
  deviceWraps: [],
  passwordWrap: null,
  vmkCheck: "enc:v1:check",
};

const USER_KEYS: StoredUserKeys = {
  kemPublicKey: "kem-pk",
  signPublicKey: "sign-pk",
  vaultKeys: { deviceWraps: [], passwordWrap: null, vmkCheck: "enc:v1:user-check" },
};

let t: TestDatabase;

beforeAll(async () => {
  t = await createTestDb();
}, 60_000);

afterAll(async () => {
  await t?.close();
});

async function family(email: string): Promise<string> {
  const id = await t.createAccount(email);
  await t.serviceDb
    .updateTable("accounts")
    .set({ vault_keys: VAULT })
    .where("id", "=", id)
    .execute();
  return id;
}

async function session(userId: string): Promise<string> {
  const row = await t.serviceDb
    .insertInto("auth_sessions")
    .values({
      token: `tok-${Math.random()}`,
      user_id: userId,
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

/** A login that signed up from an invitation: no family of its own. */
async function invitedLogin(email: string, invitationId: string): Promise<string> {
  const row = await t.serviceDb
    .insertInto("auth_users")
    .values({ name: email, email, email_verified: true, family_invitation_id: invitationId })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

function invite(accountId: string, email: string, now?: Date) {
  return createInvitation(t.serviceDb, {
    accountId,
    invitedByUserId: accountId,
    email,
    role: "co_parent",
    vmkInviteWrap: '{"v":1,"scheme":"invite","nonce":"n","ciphertext":"c"}',
    now,
  });
}

describe("creating invitations", () => {
  it("stores a pending invitation, normalizing the address", async () => {
    const owner = await family("inv-owner@example.com");
    const { id } = await invite(owner, "  Grandma@Example.com ");
    const preview = await getInvitationPreview(t.serviceDb, id);
    expect(preview).toMatchObject({
      status: "pending",
      invitedEmail: "grandma@example.com",
      role: "co_parent",
      inviterEmail: "inv-owner@example.com",
    });
    const pending = await listPendingInvitations(t.serviceDb, owner);
    expect(pending.map((p) => p.id)).toEqual([id]);
  });

  it("replaces a pending invitation to the same address", async () => {
    const owner = await family("inv-replace@example.com");
    const first = await invite(owner, "aunt@example.com");
    const second = await invite(owner, "AUNT@example.com");
    expect((await getInvitationPreview(t.serviceDb, first.id))?.status).toBe("revoked");
    expect((await getInvitationPreview(t.serviceDb, second.id))?.status).toBe("pending");
  });

  it("refuses someone already in the family", async () => {
    const owner = await family("inv-dupe@example.com");
    await expect(invite(owner, "inv-dupe@example.com")).rejects.toMatchObject({
      code: "already_member",
    });
  });

  it("is cancelled for good, erasing the sealed key", async () => {
    const owner = await family("inv-cancel@example.com");
    const { id } = await invite(owner, "cancel@example.com");
    expect(await revokeInvitation(t.serviceDb, owner, id)).toBe(true);
    expect(await revokeInvitation(t.serviceDb, owner, id)).toBe(false);
    const row = await t.serviceDb
      .selectFrom("account_invitations")
      .select("vmk_invite_wrap")
      .where("id", "=", id)
      .executeTakeFirstOrThrow();
    expect(row.vmk_invite_wrap).toBeNull();
  });
});

describe("joining a family", () => {
  it("signs up without a family of its own, then joins with its new keys", async () => {
    const owner = await family("join-owner@example.com");
    const { id } = await invite(owner, "join-new@example.com");
    expect(await isInvitationOpenFor(t.serviceDb, id, "Join-New@example.com")).toBe(true);
    expect(await isInvitationOpenFor(t.serviceDb, id, "someone@example.com")).toBe(false);

    const userId = await invitedLogin("join-new@example.com", id);
    const ownFamily = await t.serviceDb
      .selectFrom("accounts")
      .select("id")
      .where("id", "=", userId)
      .executeTakeFirst();
    expect(ownFamily).toBeUndefined();

    const login = { userId, email: "join-new@example.com", emailVerified: true };
    const key = await getInvitationKey(t.serviceDb, id, login);
    expect(key.familyVmkCheck).toBe(VAULT.vmkCheck);

    const sessionId = await session(userId);
    const joined = await acceptInvitation(t.serviceDb, {
      id,
      login,
      sessionId,
      userKeys: USER_KEYS,
      memberVmkWrap: PLACEHOLDER_MEMBER_WRAP as never,
    });
    expect(joined).toEqual({ accountId: owner, role: "co_parent" });
    expect(await resolveActiveMembership(t.serviceDb, userId, sessionId)).toMatchObject({
      accountId: owner,
      role: "co_parent",
    });
    expect(await getUserKeys(t.serviceDb, userId)).toEqual(USER_KEYS);
    expect((await getInvitationPreview(t.serviceDb, id))?.status).toBe("accepted");
    await expect(
      acceptInvitation(t.serviceDb, {
        id,
        login,
        sessionId,
        memberVmkWrap: PLACEHOLDER_MEMBER_WRAP as never,
      }),
    ).rejects.toMatchObject({ code: "not_pending" });
  });

  it("only lets the invited, verified address in", async () => {
    const owner = await family("join-guard@example.com");
    const { id } = await invite(owner, "invited@example.com");
    const other = await t.createAccount("intruder@example.com");
    await expect(
      getInvitationKey(t.serviceDb, id, {
        userId: other,
        email: "intruder@example.com",
        emailVerified: true,
      }),
    ).rejects.toMatchObject({ code: "wrong_email" });
    await expect(
      getInvitationKey(t.serviceDb, id, {
        userId: other,
        email: "invited@example.com",
        emailVerified: false,
      }),
    ).rejects.toMatchObject({ code: "wrong_email" });
  });

  it("refuses an expired link", async () => {
    const owner = await family("join-expired@example.com");
    const { id } = await invite(owner, "late@example.com", new Date(Date.now() - 8 * 86_400_000));
    expect((await getInvitationPreview(t.serviceDb, id))?.status).toBe("expired");
    await expect(
      getInvitationKey(t.serviceDb, id, {
        userId: owner,
        email: "late@example.com",
        emailVerified: true,
      }),
    ).rejects.toMatchObject({ code: "expired" });
  });

  it("needs a personal key: sent along, or already stored", async () => {
    const owner = await family("join-keys@example.com");
    const { id } = await invite(owner, "join-keys-existing@example.com");
    const existing = await t.createAccount("join-keys-existing@example.com");
    const login = { userId: existing, email: "join-keys-existing@example.com", emailVerified: true };
    await expect(
      acceptInvitation(t.serviceDb, {
        id,
        login,
        sessionId: await session(existing),
        memberVmkWrap: PLACEHOLDER_MEMBER_WRAP as never,
      }),
    ).rejects.toMatchObject({ code: "keys_required" });
  });

  it("lets an owner of another family join too (n:m)", async () => {
    const owner = await family("join-nm@example.com");
    const otherOwner = await family("join-nm-other@example.com");
    const { id } = await invite(owner, "join-nm-other@example.com");
    await acceptInvitation(t.serviceDb, {
      id,
      login: { userId: otherOwner, email: "join-nm-other@example.com", emailVerified: true },
      sessionId: await session(otherOwner),
      userKeys: USER_KEYS,
      memberVmkWrap: PLACEHOLDER_MEMBER_WRAP as never,
    });
    const members = await listMembers(t.serviceDb, owner, owner);
    expect(members.map((m) => [m.email, m.role, m.isYou])).toEqual([
      ["join-nm@example.com", "owner", true],
      ["join-nm-other@example.com", "co_parent", false],
    ]);
  });
});

describe("removing and leaving", () => {
  async function familyWithCoParent(prefix: string) {
    const owner = await family(`${prefix}-owner@example.com`);
    const coParent = await t.createAccount(`${prefix}-co@example.com`);
    await t.addMember(owner, coParent, "co_parent");
    const member = await t.createAccount(`${prefix}-member@example.com`);
    await t.addMember(owner, member, "member");
    return { owner, coParent, member };
  }

  it("never removes the owner", async () => {
    const { owner, coParent } = await familyWithCoParent("rm-owner");
    await expect(
      removeMember(t.serviceDb, {
        accountId: owner,
        actor: { userId: coParent, role: "co_parent" },
        targetUserId: owner,
      }),
    ).rejects.toMatchObject({ code: "owner" });
  });

  it("lets a scoped member leave but not remove others", async () => {
    const { owner, coParent, member } = await familyWithCoParent("rm-member");
    await expect(
      removeMember(t.serviceDb, {
        accountId: owner,
        actor: { userId: member, role: "member" },
        targetUserId: coParent,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await removeMember(t.serviceDb, {
      accountId: owner,
      actor: { userId: member, role: "member" },
      targetUserId: member,
    });
    expect((await listMembers(t.serviceDb, owner, owner)).map((m) => m.role)).toEqual([
      "owner",
      "co_parent",
    ]);
  });

  it("takes the family off the removed person's sessions and devices", async () => {
    const { owner, coParent } = await familyWithCoParent("rm-sessions");
    const sessionId = await session(coParent);
    await t.serviceDb
      .updateTable("auth_sessions")
      .set({ active_account_id: owner })
      .where("id", "=", sessionId)
      .execute();
    await t.serviceDb
      .insertInto("authorized_clients")
      .values({
        account_id: owner,
        device_id: "co-browser",
        kem_public_key: "pk",
        kind: "browser",
        status: "active",
        user_id: coParent,
        session_id: sessionId,
      })
      .execute();

    await removeMember(t.serviceDb, {
      accountId: owner,
      actor: { userId: owner, role: "owner" },
      targetUserId: coParent,
    });

    expect(await resolveActiveMembership(t.serviceDb, coParent, sessionId)).toMatchObject({
      accountId: coParent,
      role: "owner",
    });
    const client = await t.serviceDb
      .selectFrom("authorized_clients")
      .select("status")
      .where("device_id", "=", "co-browser")
      .executeTakeFirstOrThrow();
    expect(client.status).toBe("revoked");
  });
});

describe("deleting", () => {
  it("deletes the account, keeping every profile (the owner's too)", async () => {
    const owner = await family("del-owner@example.com");
    const coParent = await t.createAccount("del-co@example.com");
    await t.addMember(owner, coParent, "co_parent");

    expect(await deleteAccount(t.serviceDb, owner)).toEqual({ hadLivePublications: false });

    const users = await t.serviceDb
      .selectFrom("auth_users")
      .select("id")
      .where("id", "in", [owner, coParent])
      .execute();
    expect(users.map((u) => u.id).sort()).toEqual([owner, coParent].sort());
    const memberships = await t.serviceDb
      .selectFrom("account_members")
      .select("account_id")
      .where("user_id", "=", coParent)
      .execute();
    expect(memberships.map((m) => m.account_id)).toEqual([coParent]);
  });

  it("deletes a member's login only, and never an owner's that way", async () => {
    const owner = await family("del-login-owner@example.com");
    const member = await invitedLogin("del-login-member@example.com", crypto.randomUUID());
    await t.addMember(owner, member, "co_parent");

    expect(await deleteLogin(t.serviceDb, member)).toBe(true);
    expect((await listMembers(t.serviceDb, owner, owner)).map((m) => m.role)).toEqual(["owner"]);
    await expect(deleteLogin(t.serviceDb, owner)).rejects.toMatchObject({ code: "owns_account" });
  });
});

describe("several families per login", () => {
  it("starts a family owned by a login without one, and switches between families", async () => {
    const familyA = await family("multi-a@example.com");
    const { id } = await invite(familyA, "multi-joiner@example.com");
    const joiner = await invitedLogin("multi-joiner@example.com", id);
    const sessionId = await session(joiner);
    expect(await resolveActiveMembership(t.serviceDb, joiner, sessionId)).toBeNull();

    const { accountId: own } = await createFamily(t.serviceDb, {
      userId: joiner,
      email: "multi-joiner@example.com",
      sessionId,
    });
    expect(await resolveActiveMembership(t.serviceDb, joiner, sessionId)).toMatchObject({
      accountId: own,
      role: "owner",
    });

    await acceptInvitation(t.serviceDb, {
      id,
      login: { userId: joiner, email: "multi-joiner@example.com", emailVerified: true },
      sessionId,
      userKeys: USER_KEYS,
      memberVmkWrap: PLACEHOLDER_MEMBER_WRAP as never,
    });
    const families = await listFamiliesForUser(t.serviceDb, joiner, familyA);
    expect(families).toEqual([
      { accountId: own, role: "owner", ownerEmail: "multi-joiner@example.com", isActive: false },
      { accountId: familyA, role: "co_parent", ownerEmail: "multi-a@example.com", isActive: true },
    ]);

    expect(await setActiveFamily(t.serviceDb, { userId: joiner, sessionId, accountId: own })).toBe(true);
    expect(await resolveActiveMembership(t.serviceDb, joiner, sessionId)).toMatchObject({ accountId: own });
    const stranger = await family("multi-stranger@example.com");
    expect(
      await setActiveFamily(t.serviceDb, { userId: joiner, sessionId, accountId: stranger }),
    ).toBe(false);
  });
});

describe("scoped members", () => {
  it("join with the invitation's scopes, which the owner can change later", async () => {
    const owner = await family("scoped-owner@example.com");
    const { id } = await createInvitation(t.serviceDb, {
      accountId: owner,
      invitedByUserId: owner,
      email: "babysitter@example.com",
      role: "member",
      scopes: ["games", "kids:basic"],
      vmkInviteWrap: '{"v":1}',
    });
    expect((await getInvitationPreview(t.serviceDb, id))?.scopes).toEqual(["games", "kids:basic"]);
    const sitter = await invitedLogin("babysitter@example.com", id);
    const sessionId = await session(sitter);
    await acceptInvitation(t.serviceDb, {
      id,
      login: { userId: sitter, email: "babysitter@example.com", emailVerified: true },
      sessionId,
      userKeys: USER_KEYS,
      memberVmkWrap: PLACEHOLDER_MEMBER_WRAP as never,
    });
    expect(await resolveActiveMembership(t.serviceDb, sitter, sessionId)).toEqual({
      accountId: owner,
      role: "member",
      scopes: ["games", "kids:basic"],
    });

    await updateMemberAccess(t.serviceDb, {
      accountId: owner,
      actorRole: "owner",
      targetUserId: sitter,
      role: "co_parent",
      scopes: ["games"],
    });
    expect(await resolveActiveMembership(t.serviceDb, sitter, sessionId)).toEqual({
      accountId: owner,
      role: "co_parent",
      scopes: [],
    });
    await expect(
      updateMemberAccess(t.serviceDb, {
        accountId: owner,
        actorRole: "co_parent",
        targetUserId: owner,
        role: "member",
        scopes: ["games"],
      }),
    ).rejects.toMatchObject({ code: "owner" });
  });
});

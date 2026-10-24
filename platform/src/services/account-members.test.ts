import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestDb, type TestDatabase } from "../test-support/pglite-db";
import { listFamilyRecipients, resolveActiveMembership } from "./account-members";
import {
  getMemberView,
  updateMemberNotificationPreferences,
  updateUserLanguage,
} from "./accounts";

/**
 * account_members: a login acts as a family through its membership. Every
 * family has exactly one owner (the login that created it), a new session
 * starts in the login's only family, and the session's family is re-checked
 * on every request. Existing families and sessions are backfilled, so nobody
 * is locked out by the migration.
 */

async function insertSession(
  t: TestDatabase,
  userId: string,
  activeAccountId?: string | null,
): Promise<string> {
  const row = await t.serviceDb
    .insertInto("auth_sessions")
    .values({
      token: `tok-${Math.random()}`,
      user_id: userId,
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      updated_at: new Date().toISOString(),
      ...(activeAccountId !== undefined ? { active_account_id: activeAccountId } : {}),
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

async function activeAccountOf(t: TestDatabase, sessionId: string): Promise<string | null> {
  const row = await t.serviceDb
    .selectFrom("auth_sessions")
    .select("active_account_id")
    .where("id", "=", sessionId)
    .executeTakeFirstOrThrow();
  return row.active_account_id;
}

describe("account_members", () => {
  let t: TestDatabase;

  beforeAll(async () => {
    t = await createTestDb();
  });

  afterAll(async () => {
    await t.close();
  });

  it("makes a new sign-up the owner of its new family", async () => {
    const userId = await t.createAccount("owner@example.com");
    const rows = await t.serviceDb
      .selectFrom("account_members")
      .select(["account_id", "user_id", "role"])
      .where("user_id", "=", userId)
      .execute();
    expect(rows).toEqual([{ account_id: userId, user_id: userId, role: "owner" }]);
  });

  it("allows only one owner per family", async () => {
    const familyId = await t.createAccount("one-owner@example.com");
    const otherId = await t.createAccount("second-owner@example.com");
    await expect(
      t.serviceDb
        .insertInto("account_members")
        .values({ account_id: familyId, user_id: otherId, role: "owner" })
        .execute(),
    ).rejects.toThrow();
  });

  it("starts a new session in the login's only family", async () => {
    const userId = await t.createAccount("session@example.com");
    const sessionId = await insertSession(t, userId);
    expect(await activeAccountOf(t, sessionId)).toBe(userId);
  });

  it("leaves a new session without a family when the login has several", async () => {
    const userId = await t.createAccount("two-families@example.com");
    const otherFamily = await t.createAccount("other-family@example.com");
    await t.addMember(otherFamily, userId, "co_parent");
    const sessionId = await insertSession(t, userId);
    expect(await activeAccountOf(t, sessionId)).toBeNull();
  });

  describe("RLS", () => {
    it("shows a person the family's members and their own memberships, nothing else", async () => {
      const family = await t.createAccount("rls-family@example.com");
      const coParent = await t.createAccount("rls-coparent@example.com");
      const stranger = await t.createAccount("rls-stranger@example.com");
      await t.addMember(family, coParent, "co_parent");

      // The co-parent acting as the family sees both members.
      const asFamily = await t
        .scopedDb(family, coParent)
        .selectFrom("account_members")
        .select(["user_id", "role"])
        .where("account_id", "=", family)
        .orderBy("role")
        .execute();
      expect(asFamily).toEqual([
        { user_id: coParent, role: "co_parent" },
        { user_id: family, role: "owner" },
      ]);

      // Acting as their own family, they still see their own membership
      // elsewhere (to pick a family), but not the other members there.
      const asOwnFamily = await t
        .scopedDb(coParent, coParent)
        .selectFrom("account_members")
        .select(["account_id", "user_id"])
        .execute();
      expect(asOwnFamily).toHaveLength(2);
      expect(asOwnFamily.every((row) => row.user_id === coParent)).toBe(true);

      const asStranger = await t
        .scopedDb(stranger, stranger)
        .selectFrom("account_members")
        .select("account_id")
        .where("account_id", "=", family)
        .execute();
      expect(asStranger).toEqual([]);
    });

    it("refuses writes from the app role", async () => {
      const family = await t.createAccount("rls-write@example.com");
      const other = await t.createAccount("rls-write-other@example.com");
      await expect(
        t
          .scopedDb(family, family)
          .insertInto("account_members")
          .values({ account_id: family, user_id: other, role: "co_parent" })
          .execute(),
      ).rejects.toThrow();
    });
  });

  describe("resolveActiveMembership", () => {
    it("uses the session's family while the login is a member", async () => {
      const userId = await t.createAccount("resolve-active@example.com");
      const sessionId = await insertSession(t, userId);
      expect(await resolveActiveMembership(t.serviceDb, userId, sessionId)).toMatchObject({
        accountId: userId,
        role: "owner",
      });
    });

    it("drops a family the login was removed from and falls back to its only one", async () => {
      const userId = await t.createAccount("resolve-removed@example.com");
      const family = await t.createAccount("resolve-removed-family@example.com");
      await t.addMember(family, userId, "co_parent");
      const sessionId = await insertSession(t, userId, family);
      expect(await resolveActiveMembership(t.serviceDb, userId, sessionId)).toMatchObject({
        accountId: family,
        role: "co_parent",
      });

      await t.serviceDb
        .deleteFrom("account_members")
        .where("account_id", "=", family)
        .where("user_id", "=", userId)
        .execute();
      expect(await resolveActiveMembership(t.serviceDb, userId, sessionId)).toMatchObject({
        accountId: userId,
        role: "owner",
      });
      expect(await activeAccountOf(t, sessionId)).toBe(userId);
    });

    it("is null for a login with several families and none picked", async () => {
      const userId = await t.createAccount("resolve-several@example.com");
      const family = await t.createAccount("resolve-several-family@example.com");
      await t.addMember(family, userId, "co_parent");
      const sessionId = await insertSession(t, userId, null);
      expect(await resolveActiveMembership(t.serviceDb, userId, sessionId)).toBeNull();
    });

    it("is null for a login without a family", async () => {
      const userId = await t.createAccount("resolve-none@example.com");
      await t.serviceDb.deleteFrom("account_members").where("user_id", "=", userId).execute();
      const sessionId = await insertSession(t, userId, null);
      expect(await resolveActiveMembership(t.serviceDb, userId, sessionId)).toBeNull();
    });

    it("ignores another login's session", async () => {
      const userId = await t.createAccount("resolve-own@example.com");
      const other = await t.createAccount("resolve-other@example.com");
      const othersSession = await insertSession(t, other);
      // The only-membership fallback still applies to the caller, but the
      // other login's session is never rewritten.
      await resolveActiveMembership(t.serviceDb, userId, othersSession);
      expect(await activeAccountOf(t, othersSession)).toBe(other);
    });
  });
});

describe("per-person settings", () => {
  let t: TestDatabase;

  beforeAll(async () => {
    t = await createTestDb();
  });

  afterAll(async () => {
    await t.close();
  });

  it("keeps language and email toggles per person, not per family", async () => {
    const family = await t.createAccount("settings-owner@example.com");
    const coParent = await t.createAccount("settings-coparent@example.com");
    await t.addMember(family, coParent, "co_parent");

    await updateUserLanguage(t.scopedDb(family, coParent), coParent, "de");
    await updateMemberNotificationPreferences(t.serviceDb, family, coParent, {
      friend_approval_email: false,
    });

    expect(await getMemberView(t.scopedDb(family, coParent), family, coParent)).toEqual({
      user_id: coParent,
      role: "co_parent",
      scopes: [],
      language: "de",
      notification_preferences: { friend_approval_email: false },
    });
    expect(await getMemberView(t.scopedDb(family, family), family, family)).toMatchObject({
      role: "owner",
      language: "en",
      notification_preferences: { friend_approval_email: true },
    });
  });

  it("does not let a person read or write another person's settings", async () => {
    const family = await t.createAccount("settings-rls@example.com");
    const coParent = await t.createAccount("settings-rls-coparent@example.com");
    await expect(
      updateUserLanguage(t.scopedDb(family, coParent), family, "de"),
    ).rejects.toThrow();
    const rows = await t
      .scopedDb(family, coParent)
      .selectFrom("user_settings")
      .selectAll()
      .where("user_id", "=", family)
      .execute();
    expect(rows).toEqual([]);
  });

  it("lists the owner and co-parents as the family's email recipients", async () => {
    const family = await t.createAccount("recipients-owner@example.com");
    const coParent = await t.createAccount("recipients-coparent@example.com");
    const scoped = await t.createAccount("recipients-member@example.com");
    await t.addMember(family, coParent, "co_parent");
    await t.addMember(family, scoped, "member");
    const recipients = await listFamilyRecipients(t.serviceDb, family);
    expect(recipients.map((r) => r.email).sort()).toEqual([
      "recipients-coparent@example.com",
      "recipients-owner@example.com",
    ]);
  });
});

describe("account_members migration", () => {
  it("makes every existing family's login its owner with the family's settings, and keeps sessions in their family", async () => {
    const old = await createTestDb({ upTo: "20261016110000_feedback_message_images" });
    try {
      const accountId = await old.createAccount("existing@example.com");
      const db = old.serviceDb as unknown as import("kysely").Kysely<
        Record<string, Record<string, unknown>>
      >;
      const { id: sessionId } = (await db
        .insertInto("auth_sessions")
        .values({
          token: "tok-existing",
          user_id: accountId,
          expires_at: new Date(Date.now() + 3_600_000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .returning("id")
        .executeTakeFirstOrThrow()) as { id: string };
      await db
        .updateTable("accounts")
        .set({
          language: "de",
          notification_preferences: JSON.stringify({ publication_outcome_email: false }),
        })
        .where("id", "=", accountId)
        .execute();

      await old.migrateToLatest();

      // The family's language and email toggles become the owner's own.
      expect(
        await getMemberView(old.scopedDb(accountId, accountId), accountId, accountId),
      ).toMatchObject({
        language: "de",
        notification_preferences: { publication_outcome_email: false },
      });

      expect(await resolveActiveMembership(old.serviceDb, accountId, sessionId)).toMatchObject({
        accountId,
        role: "owner",
      });
      expect(await activeAccountOf(old, sessionId)).toBe(accountId);
    } finally {
      await old.close();
    }
  }, 30_000);
});

/**
 * Family membership (account_members): which logins may act as which family.
 *
 * A login session acts as one family at a time, `auth_sessions.active_account_id`.
 * It is re-checked against account_members on every request, so a removed
 * member loses access at once even though their session lives on.
 */
import type { FamilyMember } from "@dodi/protocol/family-members";
import type { AccountMemberRole } from "@dodi/types/database";

import type { Db } from "@/lib/db";

export class MemberError extends Error {
  constructor(readonly code: "not_found" | "owner" | "forbidden") {
    super(code);
    this.name = "MemberError";
  }
}

/** Roles with full access to the family (everything but owner-only actions). */
export const FULL_ACCESS_ROLES: readonly AccountMemberRole[] = ["owner", "co_parent"];

export function hasFullAccess(role: AccountMemberRole | undefined): boolean {
  return role !== undefined && FULL_ACCESS_ROLES.includes(role);
}

export interface ActiveMembership {
  accountId: string;
  role: AccountMemberRole;
  /** Role `member` only: what they were granted (agent scope vocabulary). */
  scopes: string[];
}

/**
 * The family a login session acts as. The session's `active_account_id` wins
 * while the login is still a member of it; otherwise a login with exactly one
 * membership falls back to it, and the session remembers it. Null: the login
 * belongs to no family, or to several and has not picked one.
 *
 * Runs on the service handle (auth tables have no app-role access); every
 * query is bound to the session's own login.
 */
export async function resolveActiveMembership(
  serviceDb: Db,
  userId: string,
  sessionId: string,
): Promise<ActiveMembership | null> {
  const active = await serviceDb
    .selectFrom("auth_sessions as s")
    .innerJoin("account_members as m", (join) =>
      join
        .onRef("m.account_id", "=", "s.active_account_id")
        .onRef("m.user_id", "=", "s.user_id"),
    )
    .select(["m.account_id", "m.role", "m.scopes"])
    .where("s.id", "=", sessionId)
    .where("s.user_id", "=", userId)
    .executeTakeFirst();
  if (active) return { accountId: active.account_id, role: active.role, scopes: active.scopes };

  const memberships = await serviceDb
    .selectFrom("account_members")
    .select(["account_id", "role", "scopes"])
    .where("user_id", "=", userId)
    .limit(2)
    .execute();
  const only = memberships.length === 1 ? memberships[0] : undefined;
  if (!only) return null;

  await serviceDb
    .updateTable("auth_sessions")
    .set({ active_account_id: only.account_id })
    .where("id", "=", sessionId)
    .where("user_id", "=", userId)
    .execute();
  return { accountId: only.account_id, role: only.role, scopes: only.scopes };
}

/** An adult who gets the family's email, with their own language and toggles. */
/**
 * The account a login joined first, or null without any: what a per-account
 * limiter counts a person's own actions against (their profile has no
 * account of its own).
 */
export async function firstAccountOf(serviceDb: Db, userId: string): Promise<string | null> {
  const row = await serviceDb
    .selectFrom("account_members")
    .select("account_id")
    .where("user_id", "=", userId)
    .orderBy("created_at")
    .limit(1)
    .executeTakeFirst();
  return row?.account_id ?? null;
}

export interface FamilyRecipient {
  userId: string;
  email: string;
  language: string;
  /** This member's opt-out toggles for this family (see NotificationPreferences). */
  notificationPreferences: unknown;
}

/**
 * The adults who get email about a family: the owner and co-parents (scoped
 * members only see what they were granted, so they get none). Needs the
 * service handle (auth tables); bounded by the account.
 */
export async function listFamilyRecipients(
  serviceDb: Db,
  accountId: string,
): Promise<FamilyRecipient[]> {
  const rows = await serviceDb
    .selectFrom("account_members as m")
    .innerJoin("auth_users as u", "u.id", "m.user_id")
    .leftJoin("user_settings as s", "s.user_id", "m.user_id")
    .select([
      "m.user_id",
      "u.email",
      "s.language",
      "m.notification_preferences",
    ])
    .where("m.account_id", "=", accountId)
    .where("m.role", "in", ["owner", "co_parent"])
    .orderBy("m.created_at")
    .execute();
  return rows.map((row) => ({
    userId: row.user_id,
    email: row.email,
    language: row.language ?? "en",
    notificationPreferences: row.notification_preferences,
  }));
}

/** A login's own language (its settings row; "en" when there is none). */
export async function getUserLanguage(
  serviceDb: Db,
  userId: string,
): Promise<string> {
  const row = await serviceDb
    .selectFrom("user_settings")
    .select("language")
    .where("user_id", "=", userId)
    .executeTakeFirst();
  return row?.language ?? "en";
}

/** The family's people, owner first. Service handle (emails live in auth_users). */
export async function listMembers(
  serviceDb: Db,
  accountId: string,
  currentUserId: string | null,
): Promise<FamilyMember[]> {
  const rows = await serviceDb
    .selectFrom("account_members as m")
    .innerJoin("auth_users as u", "u.id", "m.user_id")
    .select(["m.user_id", "u.email", "m.role", "m.scopes", "m.created_at"])
    .where("m.account_id", "=", accountId)
    .orderBy("m.created_at")
    .limit(200)
    .execute();
  const order: Record<AccountMemberRole, number> = { owner: 0, co_parent: 1, member: 2 };
  return rows
    .map((row) => ({
      userId: row.user_id,
      email: row.email,
      role: row.role,
      scopes: row.scopes,
      joinedAt: row.created_at,
      isYou: row.user_id === currentUserId,
    }))
    .sort((a, b) => order[a.role] - order[b.role]);
}

/**
 * Take someone out of the family: the owner and co-parents may remove anyone
 * but the owner, anyone but the owner may leave. Their membership (with the
 * VMK wrapped to them) goes, sessions acting as the family are moved off it,
 * and their browsers and apps are marked revoked in the family's Access list. The
 * family's key is derived from its recovery key and cannot rotate, so what a
 * removed member already decrypted stays with them: removal is a server-side
 * cut-off.
 */
export async function removeMember(
  serviceDb: Db,
  input: {
    accountId: string;
    actor: { userId: string; role: AccountMemberRole };
    targetUserId: string;
  },
): Promise<void> {
  const isSelf = input.actor.userId === input.targetUserId;
  if (!isSelf && !hasFullAccess(input.actor.role)) throw new MemberError("forbidden");

  await serviceDb.transaction().execute(async (trx) => {
    const target = await trx
      .selectFrom("account_members")
      .select("role")
      .where("account_id", "=", input.accountId)
      .where("user_id", "=", input.targetUserId)
      .executeTakeFirst();
    if (!target) throw new MemberError("not_found");
    if (target.role === "owner") throw new MemberError("owner");

    await trx
      .deleteFrom("account_members")
      .where("account_id", "=", input.accountId)
      .where("user_id", "=", input.targetUserId)
      .execute();

    await trx
      .updateTable("auth_sessions")
      .set({ active_account_id: null })
      .where("user_id", "=", input.targetUserId)
      .where("active_account_id", "=", input.accountId)
      .execute();

    // Their devices' wraps of their personal key stay: that key may open
    // other families too. Without the membership it opens nothing here.
    await trx
      .updateTable("authorized_clients")
      .set({ status: "revoked", session_id: null })
      .where("account_id", "=", input.accountId)
      .where("user_id", "=", input.targetUserId)
      .where("status", "!=", "revoked")
      .execute();
  });
}

/**
 * Start a new family owned by this login (a login without a family, or one
 * that wants another), and point the session at it. Its vault is set up next
 * by the client, like after sign-up. Service handle: the login is not a
 * member of the new family until this runs.
 */
export async function createFamily(
  serviceDb: Db,
  input: { userId: string; email: string; sessionId: string },
): Promise<{ accountId: string }> {
  return serviceDb.transaction().execute(async (trx) => {
    const settings = await trx
      .selectFrom("user_settings")
      .select("language")
      .where("user_id", "=", input.userId)
      .executeTakeFirst();
    const account = await trx
      .insertInto("accounts")
      .values({
        id: crypto.randomUUID(),
        email: input.email,
        language: settings?.language ?? "en",
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await trx
      .insertInto("account_members")
      .values({ account_id: account.id, user_id: input.userId, role: "owner" })
      .execute();
    await trx
      .updateTable("auth_sessions")
      .set({ active_account_id: account.id })
      .where("id", "=", input.sessionId)
      .where("user_id", "=", input.userId)
      .execute();
    return { accountId: account.id };
  });
}

/** One family of a login, for the switcher. */
export interface LoginFamily {
  accountId: string;
  role: AccountMemberRole;
  /** The family's owner, to tell families apart (their names are sealed). */
  ownerEmail: string | null;
  isActive: boolean;
}

/** Every family a login belongs to, its own first. */
export async function listFamiliesForUser(
  serviceDb: Db,
  userId: string,
  activeAccountId: string | null,
): Promise<LoginFamily[]> {
  const rows = await serviceDb
    .selectFrom("account_members as m")
    .leftJoin("account_members as o", (join) =>
      join.onRef("o.account_id", "=", "m.account_id").on("o.role", "=", "owner"),
    )
    .leftJoin("auth_users as u", "u.id", "o.user_id")
    .select(["m.account_id", "m.role", "u.email as owner_email", "m.created_at"])
    .where("m.user_id", "=", userId)
    .orderBy("m.created_at")
    .limit(50)
    .execute();
  return rows
    .map((row) => ({
      accountId: row.account_id,
      role: row.role,
      ownerEmail: row.owner_email,
      isActive: row.account_id === activeAccountId,
    }))
    .sort((a, b) => Number(b.role === "owner") - Number(a.role === "owner"));
}

/** Point a session at one of its login's families. False when the login is not a member. */
export async function setActiveFamily(
  serviceDb: Db,
  input: { userId: string; sessionId: string; accountId: string },
): Promise<boolean> {
  const membership = await serviceDb
    .selectFrom("account_members")
    .select("account_id")
    .where("user_id", "=", input.userId)
    .where("account_id", "=", input.accountId)
    .executeTakeFirst();
  if (!membership) return false;
  await serviceDb
    .updateTable("auth_sessions")
    .set({ active_account_id: input.accountId })
    .where("id", "=", input.sessionId)
    .where("user_id", "=", input.userId)
    .execute();
  return true;
}

/** The family a session points at (null when none). */
export async function getSessionActiveAccount(
  serviceDb: Db,
  sessionId: string,
): Promise<string | null> {
  const row = await serviceDb
    .selectFrom("auth_sessions")
    .select("active_account_id")
    .where("id", "=", sessionId)
    .executeTakeFirst();
  return row?.active_account_id ?? null;
}

/**
 * Change a non-owner's role and scopes (the owner and co-parents may). Nobody
 * becomes owner this way, and the owner's own role never changes here.
 */
export async function updateMemberAccess(
  serviceDb: Db,
  input: {
    accountId: string;
    actorRole: AccountMemberRole;
    targetUserId: string;
    role: "co_parent" | "member";
    scopes: readonly string[];
  },
): Promise<void> {
  if (!hasFullAccess(input.actorRole)) throw new MemberError("forbidden");
  const target = await serviceDb
    .selectFrom("account_members")
    .select("role")
    .where("account_id", "=", input.accountId)
    .where("user_id", "=", input.targetUserId)
    .executeTakeFirst();
  if (!target) throw new MemberError("not_found");
  if (target.role === "owner") throw new MemberError("owner");
  await serviceDb
    .updateTable("account_members")
    .set({ role: input.role, scopes: input.role === "member" ? [...input.scopes] : [] })
    .where("account_id", "=", input.accountId)
    .where("user_id", "=", input.targetUserId)
    .execute();
}

/**
 * Invitations into a family (account_invitations).
 *
 * The inviter's browser seals the family's VMK under a random link secret and
 * sends only the sealed copy here; the secret stays in the link, which the
 * inviter delivers themselves. Accepting needs a login whose verified email is
 * the invited one: its client opens the sealed copy with the secret, wraps
 * the VMK to the login's personal key, and this service records the
 * membership and erases the sealed copy.
 *
 * Every function runs on the service handle (auth tables, the invitee is not a
 * member yet) and is bound to the invitation's family or the invited login.
 */
import type { KemWrappedKey } from "@dodi/crypto";
import {
  INVITATION_TTL_DAYS,
  type InvitableRole,
  type InvitationKey,
  type InvitationPreview,
  type PendingInvitation,
} from "@dodi/protocol/family-members";
import type { Json } from "@dodi/types/database";
import type { StoredUserKeys } from "@dodi/vault";

import type { Db } from "@/lib/db";

import { getStoredVaultKeys } from "./vault-keys";
import { putUserKeys } from "./user-keys";

export class InvitationError extends Error {
  constructor(
    readonly code:
      | "not_found"
      | "not_pending"
      | "expired"
      | "wrong_email"
      | "already_member"
      | "keys_required"
      | "no_vault",
  ) {
    super(code);
    this.name = "InvitationError";
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** How invitations are compared: addresses are case-insensitive. */
export function normalizeInvitedEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Create an invitation. A pending invitation to the same address in this
 * family is replaced (its link stops working). The invited address must not
 * already belong to a member of the family.
 */
export async function createInvitation(
  serviceDb: Db,
  input: {
    accountId: string;
    invitedByUserId: string;
    email: string;
    role: InvitableRole;
    /** Role `member`: what they will be allowed (validated by the route). */
    scopes?: readonly string[];
    vmkInviteWrap: string;
    now?: Date;
  },
): Promise<{ id: string; expiresAt: string }> {
  const now = input.now ?? new Date();
  const email = normalizeInvitedEmail(input.email);
  return serviceDb.transaction().execute(async (trx) => {
    const existingMember = await trx
      .selectFrom("account_members as m")
      .innerJoin("auth_users as u", "u.id", "m.user_id")
      .select("m.user_id")
      .where("m.account_id", "=", input.accountId)
      .where((eb) => eb(eb.fn("lower", ["u.email"]), "=", email))
      .executeTakeFirst();
    if (existingMember) throw new InvitationError("already_member");

    await trx
      .updateTable("account_invitations")
      .set({ revoked_at: now.toISOString(), vmk_invite_wrap: null })
      .where("account_id", "=", input.accountId)
      .where((eb) => eb(eb.fn("lower", ["invited_email"]), "=", email))
      .where("accepted_at", "is", null)
      .where("revoked_at", "is", null)
      .execute();

    const row = await trx
      .insertInto("account_invitations")
      .values({
        account_id: input.accountId,
        invited_email: email,
        role: input.role,
        scopes: input.role === "member" ? [...(input.scopes ?? [])] : [],
        vmk_invite_wrap: input.vmkInviteWrap,
        invited_by_user_id: input.invitedByUserId,
        expires_at: new Date(now.getTime() + INVITATION_TTL_DAYS * DAY_MS).toISOString(),
      })
      .returning(["id", "expires_at"])
      .executeTakeFirstOrThrow();
    return { id: row.id, expiresAt: row.expires_at };
  });
}

/** The family's open invitations (not accepted, revoked or expired). */
export async function listPendingInvitations(
  serviceDb: Db,
  accountId: string,
  now: Date = new Date(),
): Promise<PendingInvitation[]> {
  const rows = await serviceDb
    .selectFrom("account_invitations as i")
    .leftJoin("auth_users as u", "u.id", "i.invited_by_user_id")
    .select([
      "i.id",
      "i.invited_email",
      "i.role",
      "i.scopes",
      "u.email as invited_by_email",
      "i.expires_at",
      "i.created_at",
    ])
    .where("i.account_id", "=", accountId)
    .where("i.accepted_at", "is", null)
    .where("i.revoked_at", "is", null)
    .where("i.expires_at", ">", now.toISOString())
    .orderBy("i.created_at", "desc")
    .limit(100)
    .execute();
  return rows.map((row) => ({
    id: row.id,
    invitedEmail: row.invited_email,
    role: row.role,
    scopes: row.scopes,
    invitedByEmail: row.invited_by_email,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }));
}

/** Cancel a pending invitation: its link stops working. False when there was none. */
export async function revokeInvitation(
  serviceDb: Db,
  accountId: string,
  id: string,
  now: Date = new Date(),
): Promise<boolean> {
  const rows = await serviceDb
    .updateTable("account_invitations")
    .set({ revoked_at: now.toISOString(), vmk_invite_wrap: null })
    .where("id", "=", id)
    .where("account_id", "=", accountId)
    .where("accepted_at", "is", null)
    .where("revoked_at", "is", null)
    .returning("id")
    .execute();
  return rows.length > 0;
}

function statusOf(
  row: { accepted_at: string | null; revoked_at: string | null; expires_at: string },
  now: Date,
): InvitationPreview["status"] {
  if (row.accepted_at) return "accepted";
  if (row.revoked_at) return "revoked";
  if (row.expires_at <= now.toISOString()) return "expired";
  return "pending";
}

/**
 * What the join page shows before anyone signs in: the invited address, the
 * role, who invited and whether the link still works. The id is a random
 * UUID only the link carries.
 */
export async function getInvitationPreview(
  serviceDb: Db,
  id: string,
  now: Date = new Date(),
): Promise<InvitationPreview | null> {
  const row = await serviceDb
    .selectFrom("account_invitations as i")
    .leftJoin("auth_users as u", "u.id", "i.invited_by_user_id")
    .select([
      "i.id",
      "i.invited_email",
      "i.role",
      "i.scopes",
      "u.email as inviter_email",
      "i.expires_at",
      "i.accepted_at",
      "i.revoked_at",
    ])
    .where("i.id", "=", id)
    .executeTakeFirst();
  if (!row) return null;
  return {
    id: row.id,
    status: statusOf(row, now),
    invitedEmail: row.invited_email,
    role: row.role,
    scopes: row.scopes,
    inviterEmail: row.inviter_email,
    expiresAt: row.expires_at,
  };
}

/** The invited login: its address must be the invited one, and verified. */
export interface InvitedLogin {
  userId: string;
  email: string;
  emailVerified: boolean;
}

type PendingRow = {
  account_id: string;
  invited_email: string;
  role: InvitableRole;
  scopes: string[];
  vmk_invite_wrap: string | null;
  invited_by_user_id: string | null;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
};

function assertOpenFor(row: PendingRow | undefined, login: InvitedLogin, now: Date): PendingRow {
  if (!row) throw new InvitationError("not_found");
  const status = statusOf(row, now);
  if (status === "expired") throw new InvitationError("expired");
  if (status !== "pending" || !row.vmk_invite_wrap) throw new InvitationError("not_pending");
  if (
    !login.emailVerified ||
    normalizeInvitedEmail(login.email) !== normalizeInvitedEmail(row.invited_email)
  ) {
    throw new InvitationError("wrong_email");
  }
  return row;
}

/** The sealed VMK and the family's check value, for the invited login only. */
export async function getInvitationKey(
  serviceDb: Db,
  id: string,
  login: InvitedLogin,
  now: Date = new Date(),
): Promise<InvitationKey> {
  const row = await serviceDb
    .selectFrom("account_invitations")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();
  const open = assertOpenFor(row, login, now);
  const vault = await getStoredVaultKeys(serviceDb, open.account_id);
  if (!vault) throw new InvitationError("no_vault");
  return { vmkInviteWrap: open.vmk_invite_wrap as string, familyVmkCheck: vault.vmkCheck };
}

/**
 * Join the family: store the login's personal key when it sends one, record
 * the membership with the VMK wrapped to that key, erase the invitation's
 * sealed copy, and point the session at the family. A login that already
 * belongs to the family (re-invited after losing its password) gets its wrap
 * and role replaced; the owner cannot be re-invited into their own family.
 */
export async function acceptInvitation(
  serviceDb: Db,
  input: {
    id: string;
    login: InvitedLogin;
    sessionId: string;
    userKeys?: StoredUserKeys;
    memberVmkWrap: KemWrappedKey;
    now?: Date;
  },
): Promise<{ accountId: string; role: InvitableRole }> {
  const now = input.now ?? new Date();
  return serviceDb.transaction().execute(async (trx) => {
    const row = await trx
      .selectFrom("account_invitations")
      .selectAll()
      .where("id", "=", input.id)
      .forUpdate()
      .executeTakeFirst();
    const open = assertOpenFor(row, input.login, now);
    const userId = input.login.userId;

    const existing = await trx
      .selectFrom("account_members")
      .select("role")
      .where("account_id", "=", open.account_id)
      .where("user_id", "=", userId)
      .executeTakeFirst();
    if (existing?.role === "owner") throw new InvitationError("already_member");

    if (input.userKeys) {
      await putUserKeys(trx, userId, input.userKeys);
    } else {
      const keys = await trx
        .selectFrom("user_keys")
        .select("user_id")
        .where("user_id", "=", userId)
        .executeTakeFirst();
      if (!keys) throw new InvitationError("keys_required");
    }

    const wrap = input.memberVmkWrap as unknown as Json;
    await trx
      .insertInto("account_members")
      .values({
        account_id: open.account_id,
        user_id: userId,
        role: open.role,
        scopes: open.scopes,
        member_vmk_wrap: wrap,
        invited_by_user_id: open.invited_by_user_id,
      })
      .onConflict((oc) =>
        oc
          .columns(["account_id", "user_id"])
          .doUpdateSet({ role: open.role, scopes: open.scopes, member_vmk_wrap: wrap }),
      )
      .execute();

    await trx
      .updateTable("account_invitations")
      .set({
        accepted_at: now.toISOString(),
        accepted_by_user_id: userId,
        vmk_invite_wrap: null,
      })
      .where("id", "=", input.id)
      .execute();

    await trx
      .updateTable("auth_sessions")
      .set({ active_account_id: open.account_id })
      .where("id", "=", input.sessionId)
      .where("user_id", "=", userId)
      .execute();

    return { accountId: open.account_id, role: open.role };
  });
}

/**
 * Whether a pending invitation lets this address sign up (the registration
 * gate admits invited people whatever REGISTRATION_MODE says).
 */
export async function isInvitationOpenFor(
  serviceDb: Db,
  id: string,
  email: string,
  now: Date = new Date(),
): Promise<boolean> {
  const row = await serviceDb
    .selectFrom("account_invitations")
    .select(["invited_email", "accepted_at", "revoked_at", "expires_at", "vmk_invite_wrap"])
    .where("id", "=", id)
    .executeTakeFirst();
  if (!row || statusOf(row, now) !== "pending" || !row.vmk_invite_wrap) return false;
  return normalizeInvitedEmail(row.invited_email) === normalizeInvitedEmail(email);
}

import type { Db } from "@/lib/db";

/** Email OTP kinds Better Auth issues (`emailOTP` plugin, see lib/auth.ts). */
const OTP_TYPES = ["sign-in", "email-verification", "forget-password"] as const;

export interface AccountDeletionResult {
  /** A game of this account was live on Discover, so the public catalogue changed. */
  hadLivePublications: boolean;
}

/**
 * Permanently delete an account and everything it stored. Runs on the service
 * handle, scoped to `accountId`.
 *
 * Deleting the `accounts` row is the whole erase of the account: every account
 * table (kids, memories, transcripts, games and versions, publication copies,
 * snapshots, friendships, devices, activities, usage logs, error logs,
 * rate-limit windows, companions, memberships, invitations, ...) cascades from
 * it. Other accounts keep nothing that points back here: their shares and
 * plays of this account's published games cascade away, remixed copies keep
 * their own sealed data with `source_game_id` cleared, and snapshots this
 * account's kids sent them go with the sender kid.
 *
 * Profiles (logins) stay, the owner's included: an account is not a person.
 * Every session that was using the account loses it (`active_account_id` is
 * cleared by its foreign key), so the owner and the other members land in
 * another account of theirs or on the "no account" screen, from where a
 * profile can be deleted (`deleteLogin`). Returns null when the account does
 * not exist (already deleted).
 */
export async function deleteAccount(
  db: Db,
  accountId: string,
): Promise<AccountDeletionResult | null> {
  return db.transaction().execute(async (trx) => {
    const account = await trx
      .selectFrom("accounts")
      .select("id")
      .where("id", "=", accountId)
      .executeTakeFirst();
    if (!account) return null;

    const livePublication = await trx
      .selectFrom("games")
      .select("id")
      .where("account_id", "=", accountId)
      .where("publication_requested_at", "is not", null)
      .where("published_at", "is not", null)
      .limit(1)
      .executeTakeFirst();

    await trx.deleteFrom("accounts").where("id", "=", accountId).execute();

    return { hadLivePublications: livePublication !== undefined };
  });
}

export class LoginDeletionError extends Error {
  constructor(readonly code: "owns_account") {
    super(code);
    this.name = "LoginDeletionError";
  }
}

/**
 * Permanently delete a profile (the person's login): their memberships,
 * personal key, settings and sessions go with it (Better Auth's rows cascade
 * from `auth_users`, which signs out every device at once); the accounts they
 * were in stay. A profile that still owns an account is refused: the owner
 * deletes that account first, so no account is ever left without its owner.
 * Email OTP rows are keyed by email rather than user id, so they are removed
 * explicitly instead of lingering until they expire. Returns false when the
 * login does not exist.
 */
export async function deleteLogin(db: Db, userId: string): Promise<boolean> {
  return db.transaction().execute(async (trx) => {
    const user = await trx
      .selectFrom("auth_users")
      .select("email")
      .where("id", "=", userId)
      .executeTakeFirst();
    if (!user) return false;
    const owned = await trx
      .selectFrom("account_members")
      .select("account_id")
      .where("user_id", "=", userId)
      .where("role", "=", "owner")
      .limit(1)
      .executeTakeFirst();
    if (owned) throw new LoginDeletionError("owns_account");
    await deleteLoginRows(trx, userId, user.email);
    return true;
  });
}

async function deleteLoginRows(trx: Db, userId: string, email: string): Promise<void> {
  await trx.deleteFrom("auth_users").where("id", "=", userId).execute();
  await trx
    .deleteFrom("auth_verifications")
    .where(
      "identifier",
      "in",
      OTP_TYPES.map((type) => `${type}-otp-${email}`),
    )
    .execute();
}

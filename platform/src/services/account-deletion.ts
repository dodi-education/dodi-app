import type { Db } from "@/lib/db";

/** Email OTP kinds Better Auth issues (`emailOTP` plugin, see lib/auth.ts). */
const OTP_TYPES = ["sign-in", "email-verification", "forget-password"] as const;

export interface AccountDeletionResult {
  /** A game of this account was live on Discover, so the public catalogue changed. */
  hadLivePublications: boolean;
}

/**
 * Permanently delete an account and everything the family stored. Runs on the
 * service handle (users cannot delete `auth_users`), scoped to `accountId`.
 *
 * Deleting the `auth_users` row is the whole erase: `accounts.id` references
 * it ON DELETE CASCADE, and every family table (kids, memories, transcripts,
 * games and versions, publication copies, snapshots, friendships, devices,
 * activities, usage logs, error logs, rate-limit windows, companions, ...)
 * cascades from `accounts`. Better Auth's sessions and credential rows cascade
 * from `auth_users`, which signs out every device at once. Other families keep
 * nothing that points back here: their shares and plays of this account's
 * published games cascade away, remixed copies keep their own sealed data with
 * `source_game_id` cleared, and snapshots this family's kids sent them go with
 * the sender kid.
 *
 * Email OTP rows are keyed by email rather than user id, so they are removed
 * explicitly instead of lingering until they expire. Returns null when the
 * account does not exist (already deleted).
 */
export async function deleteAccount(
  db: Db,
  accountId: string,
): Promise<AccountDeletionResult | null> {
  return db.transaction().execute(async (trx) => {
    const user = await trx
      .selectFrom("auth_users")
      .select("email")
      .where("id", "=", accountId)
      .executeTakeFirst();
    if (!user) return null;

    const livePublication = await trx
      .selectFrom("games")
      .select("id")
      .where("account_id", "=", accountId)
      .where("publication_requested_at", "is not", null)
      .where("published_at", "is not", null)
      .limit(1)
      .executeTakeFirst();

    await trx.deleteFrom("auth_users").where("id", "=", accountId).execute();

    await trx
      .deleteFrom("auth_verifications")
      .where(
        "identifier",
        "in",
        OTP_TYPES.map((type) => `${type}-otp-${user.email}`),
      )
      .execute();

    return { hadLivePublications: livePublication !== undefined };
  });
}

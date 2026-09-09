/**
 * Domain-level notifications: decides *who* to email and *whether* to, then
 * hands off to the email transport. Kept separate from request handling so the
 * trigger (an API route) can fire-and-forget. Everything here is server-blind —
 * no child/friend names, only plaintext account fields (email, language,
 * notification_preferences).
 */
import { createElement } from "react";

import type { Friendship } from "@dodi/types/database";

import { FriendApprovalEmail } from "@/emails/friend-approval";
import { friendApprovalCopy, normalizeEmailLocale } from "@/emails/strings";
import type { Db } from "@/lib/db";
import { sendEmail } from "@/lib/email";

/** The fields of a friendship needed to decide who to notify. */
type ApprovalFriendship = Pick<
  Friendship,
  | "requester_account_id"
  | "addressee_account_id"
  | "requester_parent_ok"
  | "addressee_parent_ok"
>;

/** Whether an account wants the friend-approval email. Defaults ON (opt-out). */
function wantsFriendApprovalEmail(prefs: unknown): boolean {
  if (prefs && typeof prefs === "object" && "friend_approval_email" in prefs) {
    return (prefs as { friend_approval_email?: unknown }).friend_approval_email !== false;
  }
  return true;
}

/**
 * Email the parent account(s) whose approval a friendship is now waiting on.
 * Call this only once a row has entered `awaiting_parent`; it emails the
 * requester's parent iff `requester_parent_ok === false` and the addressee's
 * parent iff `addressee_parent_ok === false` (deduped, covering the rare
 * same-account sibling case). Never throws — email must not affect the caller.
 */
export async function notifyPendingApproval(
  db: Db,
  friendship: ApprovalFriendship,
): Promise<void> {
  try {
    const targetIds = new Set<string>();
    if (friendship.requester_parent_ok === false) {
      targetIds.add(friendship.requester_account_id);
    }
    if (friendship.addressee_parent_ok === false) {
      targetIds.add(friendship.addressee_account_id);
    }
    if (targetIds.size === 0) return;

    let accounts: {
      id: string;
      email: string | null;
      language: string | null;
      notification_preferences: unknown;
    }[];
    try {
      accounts = await db
        .selectFrom("accounts")
        .select(["id", "email", "language", "notification_preferences"])
        .where("id", "in", [...targetIds])
        .execute();
    } catch (error) {
      console.error(
        "[notify] failed to load accounts for approval email:",
        error instanceof Error ? error.message : error,
      );
      return;
    }

    // Web app origin — drives the email's logo, dashboard link, and settings
    // link. The web app (and /dodi-logo.png) is served at app.dodi.app, NOT the
    // apex dodi.app. Set NEXT_PUBLIC_APP_URL on the platform to override (dev).
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.dodi.app";

    await Promise.all(
      accounts.map(async (row) => {
        if (!row.email) return;
        if (!wantsFriendApprovalEmail(row.notification_preferences)) return;
        const locale = normalizeEmailLocale(row.language);
        await sendEmail({
          to: row.email,
          subject: friendApprovalCopy(locale).subject,
          react: createElement(FriendApprovalEmail, { appUrl, locale }),
        });
      }),
    );
  } catch (err) {
    console.error("[notify] notifyPendingApproval failed:", err);
  }
}

/**
 * Domain-level notifications: decides *who* to email and *whether* to, then
 * hands off to the email transport. Kept separate from request handling so the
 * trigger (an API route) can fire-and-forget. Everything here is server-blind —
 * no child/friend names, only plaintext account fields (email, language,
 * notification_preferences).
 */
import { createElement } from "react";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Friendship } from "@dodi/types/database";

import { FriendApprovalEmail } from "@/emails/friend-approval";
import { friendApprovalCopy, normalizeEmailLocale } from "@/emails/strings";
import { sendEmail } from "@/lib/email";

type Client = SupabaseClient<Database>;

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
  supabase: Client,
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

    const { data, error } = await supabase
      .from("accounts")
      .select("id, email, language, notification_preferences")
      .in("id", [...targetIds]);
    if (error) {
      console.error(
        "[notify] failed to load accounts for approval email:",
        error.message,
      );
      return;
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://dodi.app";

    await Promise.all(
      (data ?? []).map(async (acct) => {
        const row = acct as {
          email: string | null;
          language: string | null;
          notification_preferences: unknown;
        };
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

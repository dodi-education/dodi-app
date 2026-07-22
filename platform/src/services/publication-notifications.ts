/**
 * Notifications for the publication pipeline, in two audiences:
 *
 *  - OPERATOR (SYSTEM_NOTIFICATION_EMAIL): one email when a request is created,
 *    one when the security agent rejects a submission. English-only.
 *  - PUBLISHER (the parent who submitted): one email once the review decides —
 *    approved, soft-rejected (with reasons + a resubmit hint) or hard-rejected
 *    (no details). Localized to the account's language.
 *
 * Like every notifier here, each is fire-and-forget and never throws: mail must
 * not affect the triggering request or the review worker.
 */
import { createElement } from "react";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { PublicationRejectionReason, RejectionKind } from "@dodi/protocol";
import type { Database, Game } from "@dodi/types/database";

import { PublicationOutcomeEmail } from "@/emails/publication-outcome";
import {
  PublicationRejectedEmail,
  PublicationSubmittedEmail,
} from "@/emails/publication-review";
import {
  type EmailLocale,
  normalizeEmailLocale,
  publicationOutcomeCopy,
} from "@/emails/strings";
import { sendEmail } from "@/lib/email";

type Client = SupabaseClient<Database>;

function operatorEmail(): string | null {
  const to = process.env.SYSTEM_NOTIFICATION_EMAIL;
  if (!to) {
    console.warn(
      "[notify] SYSTEM_NOTIFICATION_EMAIL is not set — skipping publication notification",
    );
    return null;
  }
  return to;
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://app.dodi.app";
}

/** The author's public byline, for operator context. Never throws. */
async function loadHandle(
  supabase: Client,
  publication: Game,
): Promise<string | null> {
  if (!publication.published_by_account_id) return null;
  const { data, error } = await supabase
    .from("accounts")
    .select("publication_handle")
    .eq("id", publication.published_by_account_id)
    .maybeSingle();
  if (error) {
    console.error("[notify] failed to load publication handle:", error.message);
    return null;
  }
  return data?.publication_handle ?? null;
}

export async function notifyPublicationSubmitted(
  supabase: Client,
  publication: Game,
): Promise<void> {
  try {
    const to = operatorEmail();
    if (!to) return;
    const handle = await loadHandle(supabase, publication);
    await sendEmail({
      to,
      subject: `dodi Discover: new publication request — ${publication.title}`,
      react: createElement(PublicationSubmittedEmail, {
        appUrl: appUrl(),
        publicationId: publication.id,
        title: publication.title,
        handle,
      }),
    });
  } catch (err) {
    console.error("[notify] notifyPublicationSubmitted failed:", err);
  }
}

export async function notifyPublicationRejected(
  supabase: Client,
  publication: Game,
  kind: RejectionKind,
  reasons: PublicationRejectionReason[],
): Promise<void> {
  try {
    const to = operatorEmail();
    if (!to) return;
    const handle = await loadHandle(supabase, publication);
    await sendEmail({
      to,
      subject: `dodi Discover: publication ${kind}-rejected — ${publication.title}`,
      react: createElement(PublicationRejectedEmail, {
        appUrl: appUrl(),
        publicationId: publication.id,
        title: publication.title,
        handle,
        kind,
        reasons,
      }),
    });
  } catch (err) {
    console.error("[notify] notifyPublicationRejected failed:", err);
  }
}

/** Whether an account wants publication-outcome email. Defaults ON (opt-out). */
function wantsOutcomeEmail(prefs: unknown): boolean {
  if (prefs && typeof prefs === "object" && "publication_outcome_email" in prefs) {
    return (
      (prefs as { publication_outcome_email?: unknown })
        .publication_outcome_email !== false
    );
  }
  return true;
}

interface Publisher {
  email: string;
  locale: EmailLocale;
}

/**
 * Resolve the game's publisher into a deliverable recipient: their plaintext
 * account email + language, honouring the opt-out toggle. Returns null (skip)
 * when there is no account, no email on file, or the toggle is off. Never
 * throws — a lookup failure just means no publisher mail.
 */
async function loadPublisher(
  supabase: Client,
  publication: Game,
): Promise<Publisher | null> {
  const accountId =
    publication.published_by_account_id ?? publication.account_id;
  if (!accountId) return null;
  const { data, error } = await supabase
    .from("accounts")
    .select("email, language, notification_preferences")
    .eq("id", accountId)
    .maybeSingle();
  if (error) {
    console.error("[notify] failed to load publisher account:", error.message);
    return null;
  }
  const row = data as {
    email: string | null;
    language: string | null;
    notification_preferences: unknown;
  } | null;
  if (!row?.email) return null;
  if (!wantsOutcomeEmail(row.notification_preferences)) return null;
  return { email: row.email, locale: normalizeEmailLocale(row.language) };
}

/** Tell the publisher their game passed review and is live on Discover. */
export async function notifyPublisherApproved(
  supabase: Client,
  publication: Game,
): Promise<void> {
  try {
    const publisher = await loadPublisher(supabase, publication);
    if (!publisher) return;
    await sendEmail({
      to: publisher.email,
      subject: publicationOutcomeCopy(publisher.locale).approvedSubject,
      react: createElement(PublicationOutcomeEmail, {
        appUrl: appUrl(),
        locale: publisher.locale,
        title: publication.title,
        outcome: "approved",
        sourceGameId: publication.source_game_id,
        reasons: [],
      }),
    });
  } catch (err) {
    console.error("[notify] notifyPublisherApproved failed:", err);
  }
}

/**
 * Tell the publisher their game was rejected. A soft rejection carries the
 * reasons and a resubmit hint; a HARD rejection carries NO details — the reason
 * list is dropped here (not merely hidden by the template) so specifics can't
 * leak to the parent.
 */
export async function notifyPublisherRejected(
  supabase: Client,
  publication: Game,
  kind: RejectionKind,
  reasons: PublicationRejectionReason[],
): Promise<void> {
  try {
    const publisher = await loadPublisher(supabase, publication);
    if (!publisher) return;
    const copy = publicationOutcomeCopy(publisher.locale);
    await sendEmail({
      to: publisher.email,
      subject: kind === "soft" ? copy.softSubject : copy.hardSubject,
      react: createElement(PublicationOutcomeEmail, {
        appUrl: appUrl(),
        locale: publisher.locale,
        title: publication.title,
        outcome: kind,
        sourceGameId: publication.source_game_id,
        reasons: kind === "soft" ? reasons : [],
      }),
    });
  } catch (err) {
    console.error("[notify] notifyPublisherRejected failed:", err);
  }
}

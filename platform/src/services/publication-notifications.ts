/**
 * Operator notifications for the publication pipeline: one email when a
 * request is created, one when the security agent rejects a submission. Both
 * go to SYSTEM_NOTIFICATION_EMAIL (the operator inbox) — parents learn the
 * outcome in the publish dialog, not by email. Like every notifier, this is
 * fire-and-forget and never throws: mail must not affect the triggering
 * request or the review worker.
 */
import { createElement } from "react";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { PublicationRejectionReason, RejectionKind } from "@dodi/protocol";
import type { Database, Game } from "@dodi/types/database";

import {
  PublicationRejectedEmail,
  PublicationSubmittedEmail,
} from "@/emails/publication-review";
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

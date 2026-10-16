/**
 * Operator notification for "Give feedback" messages (SYSTEM_NOTIFICATION_EMAIL,
 * English-only). Reply-To is the sender's account email, so the team answers
 * with a plain reply. Fire-and-forget like every notifier: mail never affects
 * the request that stored the message.
 */
import { createElement } from "react";

import type { FeedbackMessage } from "@dodi/types/database";

import { FEEDBACK_CATEGORY_LABEL, FeedbackMessageEmail } from "@/emails/feedback-message";
import type { Db } from "@/lib/db";
import { sendEmail } from "@/lib/email";

import { publicGameTitle } from "./feedback-messages";

export async function notifyFeedbackReceived(db: Db, feedback: FeedbackMessage): Promise<void> {
  try {
    const to = process.env.SYSTEM_NOTIFICATION_EMAIL;
    if (!to) {
      console.warn("[notify] SYSTEM_NOTIFICATION_EMAIL is not set, skipping feedback notification");
      return;
    }
    const account = await db
      .selectFrom("accounts")
      .select("email")
      .where("id", "=", feedback.account_id)
      .executeTakeFirst();
    const accountEmail = account?.email ?? null;
    const gameTitle = feedback.game_id ? await publicGameTitle(db, feedback.game_id) : null;
    // New messages always carry a name; only carried-over reports lack one.
    const senderName = feedback.sender_name ?? "a parent";

    await sendEmail({
      to,
      subject: `dodi feedback: ${FEEDBACK_CATEGORY_LABEL[feedback.category]} from ${senderName}`,
      ...(accountEmail ? { replyTo: accountEmail } : {}),
      react: createElement(FeedbackMessageEmail, {
        appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "https://app.dodi.app",
        feedbackId: feedback.id,
        accountId: feedback.account_id,
        accountEmail,
        senderName,
        category: feedback.category,
        message: feedback.message,
        gameId: feedback.game_id,
        gameTitle,
        clientPlatform: feedback.client_platform,
      }),
    });
  } catch (error) {
    console.error(
      "[notify] feedback notification failed:",
      error instanceof Error ? error.message : error,
    );
  }
}

/**
 * Operator notification for "Give feedback" messages (SYSTEM_NOTIFICATION_EMAIL,
 * English-only). Reply-To is the email of the login that wrote it (the
 * family's email for carried-over reports), so the team answers with a plain
 * reply. An attached image goes along as a file attachment. Fire-and-forget like every notifier: mail never affects
 * the request that stored the message.
 */
import { createElement } from "react";

import type { FeedbackMessage } from "@dodi/types/database";

import { FEEDBACK_CATEGORY_LABEL, FeedbackMessageEmail } from "@/emails/feedback-message";
import type { Db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { rasterImageExtension } from "@/lib/raster-image";

import { publicGameTitle, type FeedbackImage } from "./feedback-messages";

export async function notifyFeedbackReceived(
  db: Db,
  feedback: FeedbackMessage,
  image: FeedbackImage | null = null,
): Promise<void> {
  try {
    const to = process.env.SYSTEM_NOTIFICATION_EMAIL;
    if (!to) {
      console.warn("[notify] SYSTEM_NOTIFICATION_EMAIL is not set, skipping feedback notification");
      return;
    }
    const sender = feedback.sender_user_id
      ? await db
          .selectFrom("auth_users")
          .select("email")
          .where("id", "=", feedback.sender_user_id)
          .executeTakeFirst()
      : undefined;
    const account = sender
      ? undefined
      : await db
          .selectFrom("accounts")
          .select("email")
          .where("id", "=", feedback.account_id)
          .executeTakeFirst();
    const accountEmail = sender?.email ?? account?.email ?? null;
    const gameTitle = feedback.game_id ? await publicGameTitle(db, feedback.game_id) : null;
    // New messages always carry a name; only carried-over reports lack one.
    const senderName = feedback.sender_name ?? "a parent";
    const attachment = image
      ? {
          filename: `feedback-${feedback.id.slice(0, 8)}.${rasterImageExtension(image.contentType)}`,
          content: image.bytes,
          contentType: image.contentType,
        }
      : null;

    await sendEmail({
      to,
      subject: `dodi feedback: ${FEEDBACK_CATEGORY_LABEL[feedback.category]} from ${senderName}`,
      ...(accountEmail ? { replyTo: accountEmail } : {}),
      ...(attachment ? { attachments: [attachment] } : {}),
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
        image: attachment
          ? { filename: attachment.filename, byteSize: attachment.content.byteLength }
          : null,
      }),
    });
  } catch (error) {
    console.error(
      "[notify] feedback notification failed:",
      error instanceof Error ? error.message : error,
    );
  }
}

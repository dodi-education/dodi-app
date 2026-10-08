/**
 * Operator notification for in-app content reports (SYSTEM_NOTIFICATION_EMAIL,
 * English-only). Fire-and-forget like every notifier: mail never affects the
 * report request.
 */
import { createElement } from "react";

import type { ContentReport } from "@dodi/types/database";

import { ContentReportEmail } from "@/emails/content-report";
import type { Db } from "@/lib/db";
import { sendEmail } from "@/lib/email";

import { reportedGameTitle } from "./content-reports";

export async function notifyContentReported(db: Db, report: ContentReport): Promise<void> {
  try {
    const to = process.env.SYSTEM_NOTIFICATION_EMAIL;
    if (!to) {
      console.warn("[notify] SYSTEM_NOTIFICATION_EMAIL is not set, skipping content report notification");
      return;
    }
    const gameTitle = report.game_id ? await reportedGameTitle(db, report.game_id) : null;
    await sendEmail({
      to,
      subject: `dodi: new content report (${report.content_kind})`,
      react: createElement(ContentReportEmail, {
        appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "https://app.dodi.app",
        reportId: report.id,
        contentKind: report.content_kind,
        reason: report.reason,
        details: report.details,
        gameId: report.game_id,
        gameTitle,
        clientPlatform: report.client_platform,
      }),
    });
  } catch (error) {
    console.error(
      "[notify] content report notification failed:",
      error instanceof Error ? error.message : error,
    );
  }
}

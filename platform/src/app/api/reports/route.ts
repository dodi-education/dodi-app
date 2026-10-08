import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { serviceDb } from "@/lib/db";
import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import { ContentReportTargetError, createContentReport } from "@/services/content-reports";
import { consumeRateLimit } from "@/services/rate-limits";
import { notifyContentReported } from "@/services/report-notifications";

const ReportSchema = z.object({
  contentKind: z.enum(["companion_answer", "game", "discover_game"]),
  reason: z.enum(["inappropriate", "upsetting", "wrong", "other"]),
  details: z.string().trim().max(2000).optional(),
  kidId: z.string().uuid().optional(),
  gameId: z.string().uuid().optional(),
  clientPlatform: z.enum(["web", "mobile"]),
});

/** Reports per account and hour: plenty for real use, a cap on inbox spam. */
const REPORT_LIMIT = { bucket: "content_report", limit: 20, windowMs: 60 * 60 * 1000 };

/**
 * User-authed: report an AI answer or a game to the operator (the in-app
 * flagging Google Play requires for AI-generated content, and the App Store
 * for user-generated content). Stored plaintext and emailed to the operator.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId } = auth;

  const body: unknown = await request.json().catch(() => null);
  const result = ReportSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.issues },
      { status: 400 },
    );
  }
  const input = result.data;

  try {
    const attempt = await consumeRateLimit(serviceDb, { accountId, ...REPORT_LIMIT });
    if (!attempt.allowed) {
      return NextResponse.json({ error: "Too many reports", code: "RATE_LIMITED" }, { status: 429 });
    }

    const report = await createContentReport(serviceDb, {
      accountId,
      contentKind: input.contentKind,
      reason: input.reason,
      details: input.details || null,
      kidId: input.kidId ?? null,
      gameId: input.gameId ?? null,
      clientPlatform: input.clientPlatform,
    });
    await notifyContentReported(serviceDb, report);
    return NextResponse.json({ id: report.id }, { status: 201 });
  } catch (error) {
    if (error instanceof ContentReportTargetError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return serverErrorResponse(error, "Failed to file report", "api/reports#POST", {
      accountId,
      expose: false,
    });
  }
}

import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import { getKid } from "@/services/kids";
import { getMonthlyUsage, recordUsage } from "@/services/usage";

const TokenUsageSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheWriteTokens: z.number(),
  cacheReadTokens: z.number(),
});

// Per-component context/output sizes the client measured — one field per
// component, all optional (each event type sends the subset it has).
const UsageMetaSchema = z
  .object({
    turns: z.number(),
    validationRetries: z.number(),
    outputChars: z.number(),
    memoryChars: z.number(),
    parentNotesChars: z.number(),
    learningGoalChars: z.number(),
    successDefChars: z.number(),
    promptChars: z.number(),
    tagsChars: z.number(),
    personaChars: z.number(),
  })
  .partial();

const UsageReportSchema = z.object({
  eventType: z.enum([
    "game_create",
    "game_edit",
    "game_analysis",
    "memory_update",
    "voice_minutes",
  ]),
  kidId: z.string().uuid().nullable().optional(),
  gameId: z.string().uuid().nullable().optional(),
  provider: z.string().min(1),
  model: z.string().min(1),
  usage: TokenUsageSchema.optional(),
  voiceSeconds: z.number().nonnegative().optional(),
  meta: UsageMetaSchema.optional(),
});

/** User-authed: record one AI usage event. `account_id` is stamped from auth. */
export async function POST(request: Request): Promise<Response> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId, supabase } = auth;

  const body: unknown = await request.json();
  const parsed = UsageReportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const report = parsed.data;

  try {
    // Attribution must belong to the caller's account (like the plays route).
    if (report.kidId) {
      const kid = await getKid(supabase, report.kidId);
      if (!kid || kid.account_id !== accountId) {
        return NextResponse.json({ error: "Kid not found" }, { status: 404 });
      }
    }

    const event = await recordUsage(supabase, { accountId, ...report });
    return NextResponse.json({ id: event.id }, { status: 201 });
  } catch (error) {
    return serverErrorResponse(error, "Failed to record usage", "api/usage#POST", {
      accountId,
    });
  }
}

/**
 * User-authed: this month's AI usage for the parent "Usage" page. Usage only —
 * no cost. Under BYOK the provider's own dashboards are the source of truth for
 * money; here the parent sees activity (voice minutes, games made, per-kid/model).
 */
export async function GET(request: Request): Promise<Response> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId, supabase } = auth;

  try {
    const monthly = await getMonthlyUsage(supabase, accountId, new Date());
    return NextResponse.json({
      perModel: monthly.perModel,
      perKid: monthly.perKid,
      gamesByModel: monthly.gamesByModel,
      voiceSeconds: monthly.voiceSeconds,
    });
  } catch (error) {
    return serverErrorResponse(error, "Failed to load usage", "api/usage#GET", {
      accountId,
    });
  }
}

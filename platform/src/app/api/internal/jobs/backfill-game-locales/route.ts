import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { serverErrorResponse } from "@/lib/error-logs";
import { isInternalAuthorized } from "@/lib/internal-auth";
import { serviceClient } from "@/lib/supabase";
import { backfillGameLocales } from "@/services/game-locale-backfill";

/**
 * The locale-backfill trigger: adds newly supported platform locales to
 * already-published games (see services/game-locale-backfill). Ops m2m only —
 * x-ops-secret via /api/internal auth; deliberately NOT a Vercel Cron (not in
 * CRON_PATHS): a new platform language ships rarely, and the run is operator-
 * paced with a dry-run first. POST only. Safe to repeat — done rows fall out
 * of the candidate query via available_locales.
 */
export const maxDuration = 300;

const BodySchema = z.object({
  limit: z.number().int().min(1).max(50).optional(),
  dryRun: z.boolean().optional(),
});

/** One structured stdout line per run — Vercel Runtime Logs capture stdout,
 *  not response bodies (same rationale as review-publications). */
function logRunSummary(
  scope: string,
  result: Awaited<ReturnType<typeof backfillGameLocales>>,
  durationMs: number,
): void {
  const level = result.errors > 0 ? "error" : result.disabled ? "warn" : "info";
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    scope,
    event: "game_locale_backfill_run",
    ...result,
    durationMs,
  });
  (level === "error" ? console.error : console.log)(line);
}

export async function POST(request: Request): Promise<NextResponse> {
  const scope = "api/internal/jobs/backfill-game-locales#POST";
  if (!isInternalAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: unknown = await request.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const startedAt = Date.now();
  try {
    const result = await backfillGameLocales(serviceClient(), parsed.data);
    logRunSummary(scope, result, Date.now() - startedAt);
    return NextResponse.json(result);
  } catch (error) {
    return serverErrorResponse(error, "Failed to backfill game locales", scope, {});
  }
}

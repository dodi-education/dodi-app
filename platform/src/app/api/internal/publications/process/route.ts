import { NextResponse } from "next/server";

import { serverErrorResponse } from "@/lib/error-logs";
import { isInternalAuthorized } from "@/lib/internal-auth";
import { serviceClient } from "@/lib/supabase";
import { processPendingPublications } from "@/services/publication-review";

/**
 * The review worker trigger: claims pending submissions and runs the security
 * agent over each (see services/publication-review). Ops m2m only —
 * /api/internal auth (x-ops-secret, or the Vercel Cron bearer which
 * lib/internal-auth scopes to exactly this path). Idempotent and safe to
 * overlap — items are claimed optimistically, a lost claim is a skip.
 */
export const maxDuration = 300;

/**
 * Emit one structured summary line per run. Vercel Runtime Logs capture stdout,
 * NOT the JSON response body — so without this a healthy run (even one that
 * approves games, or one that silently no-ops because the security agent is
 * unconfigured: `disabled`) leaves no trace. Written straight to console rather
 * than through the fs-backed logger: that logger defaults to level "none" in
 * production and writes to a read-only path on serverless, so it would suppress
 * this. Level follows the outcome so a drain/filter can alert on errors.
 */
function logRunSummary(
  scope: string,
  result: Awaited<ReturnType<typeof processPendingPublications>>,
  durationMs: number,
): void {
  const level = result.errors > 0 ? "error" : result.disabled ? "warn" : "info";
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    scope,
    event: "publication_review_run",
    ...result,
    durationMs,
  });
  (level === "error" ? console.error : console.log)(line);
}

async function run(scope: string, request: Request): Promise<NextResponse> {
  if (!isInternalAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const startedAt = Date.now();
  try {
    const result = await processPendingPublications(serviceClient());
    logRunSummary(scope, result, Date.now() - startedAt);
    return NextResponse.json(result);
  } catch (error) {
    return serverErrorResponse(
      error,
      "Failed to process pending publications",
      scope,
      {},
    );
  }
}

/** Vercel Cron invokes GET. */
export async function GET(request: Request): Promise<NextResponse> {
  return run("api/internal/publications/process#GET", request);
}

/** Manual trigger (curl, ops console, external scheduler). */
export async function POST(request: Request): Promise<NextResponse> {
  return run("api/internal/publications/process#POST", request);
}

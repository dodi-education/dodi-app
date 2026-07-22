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

async function run(scope: string, request: Request): Promise<NextResponse> {
  if (!isInternalAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await processPendingPublications(serviceClient());
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

import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { serverErrorResponse } from "@/lib/error-logs";
import { isInternalAuthorized } from "@/lib/internal-auth";
import { serviceDb } from "@/lib/db";
import { notifyPublisherApproved } from "@/services/publication-notifications";
import {
  PublicationError,
  approvePublication,
} from "@/services/game-publications";

/**
 * Stamp a submission as approved (admin override path; the security agent
 * approves through the process worker). Ops m2m only — /api/internal auth,
 * see lib/internal-auth.
 *
 * `actor` is the staff member behind the decision, sent by the ops console:
 * logged for the audit trail, never persisted on the game. Optional so the
 * older curl/worker callers keep working.
 */
const ReviewSchema = z.object({
  approvedBy: z.enum(["system", "admin"]),
  actor: z.string().trim().max(200).optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * One structured line per manual verdict. Written straight to console rather
 * than through the fs-backed logger, which defaults to level "none" in
 * production — same reasoning as the review-worker run summary.
 */
function logVerdict(
  publicationId: string,
  approvedBy: "system" | "admin",
  actor: string | undefined,
): void {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "info",
      scope: "api/internal/publications/[id]/review#POST",
      event: "publication_approved",
      publicationId,
      approvedBy,
      actor: actor ?? null,
    }),
  );
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;

  if (!isInternalAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: unknown = await request.json();
  const parsed = ReviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const publication = await approvePublication(
      serviceDb,
      id,
      parsed.data.approvedBy,
    );
    // Audit first: the decision is recorded even if mail is unavailable.
    logVerdict(publication.id, parsed.data.approvedBy, parsed.data.actor);
    // Same outcome as the automated worker: let the publisher know their game
    // is live. Fire-and-forget — never throws, never blocks the response body.
    await notifyPublisherApproved(serviceDb, publication);
    return NextResponse.json({ publication });
  } catch (error) {
    if (error instanceof PublicationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return serverErrorResponse(
      error,
      "Failed to review publication",
      "api/internal/publications/[id]/review#POST",
      {},
    );
  }
}

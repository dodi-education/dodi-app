import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { REJECTION_CODES, worstRejectionKind } from "@dodi/protocol";

import { serverErrorResponse } from "@/lib/error-logs";
import { isInternalAuthorized } from "@/lib/internal-auth";
import { serviceDb } from "@/lib/db";
import {
  notifyPublicationRejected,
  notifyPublisherRejected,
} from "@/services/publication-notifications";
import {
  PublicationError,
  rejectPublication,
} from "@/services/game-publications";

/**
 * Stamp a submission as rejected (admin override path; the security agent
 * rejects through the process worker). Ops m2m only — /api/internal auth, see
 * lib/internal-auth.
 *
 * The outcome sequence mirrors services/publication-review exactly: stamp,
 * then tell the operator, then tell the publisher. `actor` is the staff member
 * behind the decision: logged for the audit trail, never persisted on the game.
 */
const RejectSchema = z
  .object({
    kind: z.enum(["hard", "soft"]),
    reasons: z
      .array(
        z.object({
          code: z.enum(REJECTION_CODES),
          note: z.string().trim().min(1).max(1000),
        }),
      )
      .min(1)
      .max(10),
    actor: z.string().trim().min(1).max(200),
  })
  .refine((body) => worstRejectionKind(body.reasons) === body.kind, {
    message: "kind must match the worst reason code",
    path: ["kind"],
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
  scope: string,
  publicationId: string,
  kind: "hard" | "soft",
  codes: string[],
  actor: string,
): void {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "info",
      scope,
      event: "publication_rejected",
      publicationId,
      kind,
      codes,
      actor,
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
  const parsed = RejectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { kind, reasons, actor } = parsed.data;

  try {
    const publication = await rejectPublication(serviceDb, id, { kind, reasons });
    // Audit first: the decision is recorded even if mail is unavailable.
    logVerdict(
      "api/internal/publications/[id]/reject#POST",
      publication.id,
      kind,
      reasons.map((reason) => reason.code),
      actor,
    );
    // Same outcome as the automated worker: operator first, then the publisher.
    await notifyPublicationRejected(serviceDb, publication, kind, reasons);
    await notifyPublisherRejected(serviceDb, publication, kind, reasons);
    return NextResponse.json({
      publication: {
        id: publication.id,
        // rejectPublication only returns rows it just stamped.
        rejectedAt: publication.rejected_at as string,
        rejectionKind: kind,
      },
    });
  } catch (error) {
    if (error instanceof PublicationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return serverErrorResponse(
      error,
      "Failed to reject publication",
      "api/internal/publications/[id]/reject#POST",
      {},
    );
  }
}

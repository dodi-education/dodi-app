import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { constantTimeEqual, utf8ToBytes } from "@dodi/crypto";

import { serverErrorResponse } from "@/lib/error-logs";
import { serviceClient } from "@/lib/supabase";
import {
  PublicationError,
  approvePublication,
} from "@/services/game-publications";

/**
 * Stamp a submission as approved — the machine end of the review loop.
 *
 * This is NOT a user-authenticated route. It is called server-to-server by the
 * review pass (today: manually or by a job; later: the automated content harness
 * that scans a submission for harmful content, secrets and PII), authenticated
 * by the shared secret in PUBLICATION_REVIEW_SECRET via the x-review-secret
 * header. Same fail-closed shape as the before-user-created auth hook: with no
 * secret configured the route refuses rather than defaulting open.
 */
const ReviewSchema = z.object({
  approvedBy: z.enum(["system", "admin"]),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

function isAuthorized(request: Request): boolean {
  const expected = process.env.PUBLICATION_REVIEW_SECRET;
  if (!expected) return false;
  const provided = request.headers.get("x-review-secret") ?? "";
  return constantTimeEqual(utf8ToBytes(provided), utf8ToBytes(expected));
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;

  if (!isAuthorized(request)) {
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
      serviceClient(),
      id,
      parsed.data.approvedBy,
    );
    return NextResponse.json({ publication });
  } catch (error) {
    if (error instanceof PublicationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return serverErrorResponse(
      error,
      "Failed to review publication",
      "api/publications/[id]/review#POST",
      {},
    );
  }
}

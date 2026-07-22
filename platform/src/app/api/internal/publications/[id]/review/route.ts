import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { serverErrorResponse } from "@/lib/error-logs";
import { isInternalAuthorized } from "@/lib/internal-auth";
import { serviceClient } from "@/lib/supabase";
import { notifyPublisherApproved } from "@/services/publication-notifications";
import {
  PublicationError,
  approvePublication,
} from "@/services/game-publications";

/**
 * Stamp a submission as approved (admin override path; the security agent
 * approves through the process worker). Ops m2m only — /api/internal auth,
 * see lib/internal-auth.
 */
const ReviewSchema = z.object({
  approvedBy: z.enum(["system", "admin"]),
});

interface RouteContext {
  params: Promise<{ id: string }>;
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
    const supabase = serviceClient();
    const publication = await approvePublication(
      supabase,
      id,
      parsed.data.approvedBy,
    );
    // Same outcome as the automated worker: let the publisher know their game
    // is live. Fire-and-forget — never throws, never blocks the response body.
    await notifyPublisherApproved(supabase, publication);
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

import { NextResponse } from "next/server";

import { UUID, validationFailed } from "@/lib/asset-publication-api";
import { serviceDb } from "@/lib/db";
import { feedbackActionResponse, staffActorFrom } from "@/lib/feedback-ops-api";
import { isInternalAuthorized } from "@/lib/internal-auth";
import { solveFeedback } from "@/services/feedback-messages";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Mark a message solved. The staff email is stored on the row, so it is
 * required (body `actor`, or the `x-ops-actor` header). Ops m2m only.
 */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  if (!isInternalAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  if (!UUID.safeParse(id).success) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const actor = await staffActorFrom(request);
  if (!actor) return validationFailed([{ path: ["actor"], message: "The staff email is required" }]);
  const outcome = await solveFeedback(serviceDb, id, actor);
  return feedbackActionResponse(outcome, {
    scope: "api/internal/feedback/[id]/solve#POST",
    event: "feedback_solved",
    feedbackId: id,
    actor,
  });
}

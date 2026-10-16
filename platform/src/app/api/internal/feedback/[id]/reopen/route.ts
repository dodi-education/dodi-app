import { NextResponse } from "next/server";

import { UUID } from "@/lib/asset-publication-api";
import { serviceDb } from "@/lib/db";
import { feedbackActionResponse, staffActorFrom } from "@/lib/feedback-ops-api";
import { isInternalAuthorized } from "@/lib/internal-auth";
import { reopenFeedback } from "@/services/feedback-messages";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Put a solved message back in the open inbox (it stays read). Ops m2m only. */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  if (!isInternalAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  if (!UUID.safeParse(id).success) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const actor = await staffActorFrom(request);
  const outcome = await reopenFeedback(serviceDb, id);
  return feedbackActionResponse(outcome, {
    scope: "api/internal/feedback/[id]/reopen#POST",
    event: "feedback_reopened",
    feedbackId: id,
    actor,
  });
}

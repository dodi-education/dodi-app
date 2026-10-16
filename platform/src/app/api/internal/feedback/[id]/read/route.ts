import { NextResponse } from "next/server";

import { UUID } from "@/lib/asset-publication-api";
import { serviceDb } from "@/lib/db";
import { feedbackActionResponse, staffActorFrom } from "@/lib/feedback-ops-api";
import { isInternalAuthorized } from "@/lib/internal-auth";
import { markFeedbackRead } from "@/services/feedback-messages";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** A staff member opened the message: it leaves the unread badge. Idempotent. Ops m2m only. */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  if (!isInternalAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  if (!UUID.safeParse(id).success) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const actor = await staffActorFrom(request);
  const outcome = await markFeedbackRead(serviceDb, id);
  return feedbackActionResponse(outcome, {
    scope: "api/internal/feedback/[id]/read#POST",
    event: "feedback_read",
    feedbackId: id,
    actor,
  });
}

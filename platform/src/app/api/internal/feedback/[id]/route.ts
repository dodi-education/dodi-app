import { NextResponse } from "next/server";

import { UUID } from "@/lib/asset-publication-api";
import { serviceDb } from "@/lib/db";
import { serverErrorResponse } from "@/lib/error-logs";
import { isInternalAuthorized } from "@/lib/internal-auth";
import { getOpsFeedback } from "@/services/feedback-messages";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * One feedback message in full. Reading it changes nothing: the console marks
 * it read with a separate POST once a staff member actually opens it, so a
 * prefetch never clears the unread badge. Ops m2m only.
 */
export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  if (!isInternalAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  if (!UUID.safeParse(id).success) return NextResponse.json({ error: "not_found" }, { status: 404 });
  try {
    const feedback = await getOpsFeedback(serviceDb, id);
    if (!feedback) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(feedback);
  } catch (error) {
    return serverErrorResponse(error, "Failed to load feedback", "api/internal/feedback/[id]#GET", {});
  }
}

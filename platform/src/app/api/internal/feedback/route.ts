import { NextResponse } from "next/server";

import { serviceDb } from "@/lib/db";
import { serverErrorResponse } from "@/lib/error-logs";
import { isInternalAuthorized } from "@/lib/internal-auth";
import { OpsFeedbackQuerySchema, listOpsFeedback } from "@/services/feedback-messages";

/**
 * One page of the feedback inbox for the ops console, newest first, with the
 * unread / open / solved counts. Ops m2m only: /api/internal auth, see
 * lib/internal-auth. Messages are plaintext by design; a game appears by id.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!isInternalAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = OpsFeedbackQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(await listOpsFeedback(serviceDb, parsed.data));
  } catch (error) {
    return serverErrorResponse(error, "Failed to list feedback", "api/internal/feedback#GET", {});
  }
}

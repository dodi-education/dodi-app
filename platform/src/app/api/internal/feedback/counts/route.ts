import { NextResponse } from "next/server";

import { serviceDb } from "@/lib/db";
import { serverErrorResponse } from "@/lib/error-logs";
import { isInternalAuthorized } from "@/lib/internal-auth";
import { getOpsFeedbackCounts } from "@/services/feedback-messages";

/** The console's unread badge: unread / open / solved message counts. Ops m2m only. */
export async function GET(request: Request): Promise<NextResponse> {
  if (!isInternalAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await getOpsFeedbackCounts(serviceDb));
  } catch (error) {
    return serverErrorResponse(
      error,
      "Failed to count feedback",
      "api/internal/feedback/counts#GET",
      {},
    );
  }
}

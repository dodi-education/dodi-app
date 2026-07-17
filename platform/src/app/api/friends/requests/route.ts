import { NextResponse } from "next/server";

import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import { serviceClient } from "@/lib/supabase";
import { listRequests } from "@/services/friends";

/** Pending requests for a kid. ?kidId= required; ?direction=incoming|outgoing. */
export async function GET(request: Request): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  const params = new URL(request.url).searchParams;
  const kidId = params.get("kidId");
  const direction = params.get("direction") ?? "incoming";
  if (!kidId) {
    return NextResponse.json({ error: "kidId is required" }, { status: 400 });
  }
  if (direction !== "incoming" && direction !== "outgoing") {
    return NextResponse.json(
      { error: "direction must be 'incoming' or 'outgoing'" },
      { status: 400 },
    );
  }

  try {
    const requests = await listRequests(serviceClient(), {
      accountId: auth.accountId,
      kidId,
      direction,
    });
    return NextResponse.json(requests);
  } catch (error) {
    return serverErrorResponse(error, "Failed to fetch requests", "api/friends/requests#GET", {
      accountId: auth.accountId,
    });
  }
}

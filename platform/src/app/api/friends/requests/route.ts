import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/resolve-auth";
import { serviceClient } from "@/lib/supabase";
import { listRequests } from "@/services/friends";

/** Pending requests for a kid. ?profileId= required; ?direction=incoming|outgoing. */
export async function GET(request: Request): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  const params = new URL(request.url).searchParams;
  const profileId = params.get("profileId");
  const direction = params.get("direction") ?? "incoming";
  if (!profileId) {
    return NextResponse.json({ error: "profileId is required" }, { status: 400 });
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
      profileId,
      direction,
    });
    return NextResponse.json(requests);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch requests";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

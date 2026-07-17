import { NextResponse } from "next/server";

import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import { serviceClient } from "@/lib/supabase";
import { listFriends } from "@/services/friends";

/** Accepted friends of a kid. Requires ?kidId=. */
export async function GET(request: Request): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  const kidId = new URL(request.url).searchParams.get("kidId");
  if (!kidId) {
    return NextResponse.json({ error: "kidId is required" }, { status: 400 });
  }

  try {
    const friends = await listFriends(serviceClient(), {
      accountId: auth.accountId,
      kidId,
    });
    return NextResponse.json(friends);
  } catch (error) {
    return serverErrorResponse(error, "Failed to fetch friends", "api/friends#GET", {
      accountId: auth.accountId,
    });
  }
}

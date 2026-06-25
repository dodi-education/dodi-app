import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/resolve-auth";
import { serviceClient } from "@/lib/supabase";
import { listFriends } from "@/services/friends";

/** Accepted friends of a kid profile. Requires ?profileId=. */
export async function GET(request: Request): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  const profileId = new URL(request.url).searchParams.get("profileId");
  if (!profileId) {
    return NextResponse.json({ error: "profileId is required" }, { status: 400 });
  }

  try {
    const friends = await listFriends(serviceClient(), {
      accountId: auth.accountId,
      profileId,
    });
    return NextResponse.json(friends);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch friends";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

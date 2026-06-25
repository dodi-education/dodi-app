import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/resolve-auth";
import { serviceClient } from "@/lib/supabase";
import { listBlocked } from "@/services/friends";

/** Profiles this kid has blocked. ?profileId= required. */
export async function GET(request: Request): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  const profileId = new URL(request.url).searchParams.get("profileId");
  if (!profileId) {
    return NextResponse.json({ error: "profileId is required" }, { status: 400 });
  }

  try {
    const blocked = await listBlocked(serviceClient(), {
      accountId: auth.accountId,
      profileId,
    });
    return NextResponse.json(blocked);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch blocked list";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/resolve-auth";
import { serviceClient } from "@/lib/supabase";
import { listCardRefreshTargets } from "@/services/friends";

/**
 * Friendships whose card this kid seals and should re-seal after editing their
 * shared data (name / avatar / birthdate). Returns each counterpart's public KEM
 * key so the client can re-seal. Requires ?profileId=.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  const profileId = new URL(request.url).searchParams.get("profileId");
  if (!profileId) {
    return NextResponse.json({ error: "profileId is required" }, { status: 400 });
  }

  try {
    const targets = await listCardRefreshTargets(serviceClient(), {
      accountId: auth.accountId,
      profileId,
    });
    return NextResponse.json(targets);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list card targets";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

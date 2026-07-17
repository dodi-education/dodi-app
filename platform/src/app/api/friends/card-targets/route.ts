import { NextResponse } from "next/server";

import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import { serviceClient } from "@/lib/supabase";
import { listCardRefreshTargets } from "@/services/friends";

/**
 * Friendships whose card this kid seals and should re-seal after editing their
 * shared data (name / avatar / birthdate). Returns each counterpart's public KEM
 * key so the client can re-seal. Requires ?kidId=.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  const kidId = new URL(request.url).searchParams.get("kidId");
  if (!kidId) {
    return NextResponse.json({ error: "kidId is required" }, { status: 400 });
  }

  try {
    const targets = await listCardRefreshTargets(serviceClient(), {
      accountId: auth.accountId,
      kidId,
    });
    return NextResponse.json(targets);
  } catch (error) {
    return serverErrorResponse(
      error,
      "Failed to list card targets",
      "api/friends/card-targets#GET",
      { accountId: auth.accountId },
    );
  }
}

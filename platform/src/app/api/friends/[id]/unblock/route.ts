import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/resolve-auth";
import { serviceClient } from "@/lib/supabase";
import { unblockFriend } from "@/services/friends";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Unblock (only the blocker); removes the row so reconnecting needs a fresh request. */
export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  const body = (await request.json().catch(() => null)) as {
    profileId?: string;
  } | null;
  if (!body?.profileId) {
    return NextResponse.json({ error: "profileId is required" }, { status: 400 });
  }

  try {
    await unblockFriend(serviceClient(), {
      accountId: auth.accountId,
      profileId: body.profileId,
      friendshipId: id,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to unblock";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/resolve-auth";
import { serviceClient } from "@/lib/supabase";
import { blockFriend } from "@/services/friends";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Block a friendship. `profileId` is the acting kid (the blocker). */
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
    const row = await blockFriend(serviceClient(), {
      accountId: auth.accountId,
      profileId: body.profileId,
      friendshipId: id,
    });
    return NextResponse.json({ id: row.id, status: row.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to block";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

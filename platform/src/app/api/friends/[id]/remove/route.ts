import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/resolve-auth";
import { serviceClient } from "@/lib/supabase";
import { removeFriendship } from "@/services/friends";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Withdraw an outgoing request or unfriend an accepted friend (deletes the row). */
export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  const body = (await request.json().catch(() => null)) as {
    kidId?: string;
  } | null;
  if (!body?.kidId) {
    return NextResponse.json({ error: "kidId is required" }, { status: 400 });
  }

  try {
    await removeFriendship(serviceClient(), {
      accountId: auth.accountId,
      kidId: body.kidId,
      friendshipId: id,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to remove";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

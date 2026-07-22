import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import { serviceClient } from "@/lib/supabase";
import { getPublishedGame } from "@/services/discover";
import { getGameSharing, replaceGameSharings } from "@/services/games";

/**
 * THIS family's audience for a published Discover game — how a game is
 * "added": no copy is made, sharing rows point the family's kids at the single
 * published row (play-in-place, so plays aggregate for popularity).
 *
 * The game row is verified through the service client (RLS hides other
 * accounts' rows); the sharing rows are written through the CALLER's client —
 * RLS restricts them to the caller's own account, and the per-account unique
 * index lets many families family-share the same game.
 */
const PutSharingSchema = z.object({
  isFamily: z.boolean(),
  audienceIds: z.array(z.string().uuid()).max(50),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;

  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId, supabase } = auth;

  try {
    const game = await getPublishedGame(serviceClient(), id);
    if (!game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }
    // RLS scopes the rows to the caller's account — this is THEIR audience.
    const sharing = await getGameSharing(supabase, id);
    return NextResponse.json({ sharing });
  } catch (error) {
    return serverErrorResponse(
      error,
      "Failed to fetch sharing",
      "api/discover/games/[id]/sharing#GET",
      { accountId },
    );
  }
}

export async function PUT(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;

  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId, supabase } = auth;

  const body: unknown = await request.json();
  const parsed = PutSharingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const game = await getPublishedGame(serviceClient(), id);
    if (!game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }
    await replaceGameSharings(supabase, id, accountId, {
      family: parsed.data.isFamily,
      kidIds: parsed.data.audienceIds,
    });
    const sharing = await getGameSharing(supabase, id);
    return NextResponse.json({ sharing });
  } catch (error) {
    return serverErrorResponse(
      error,
      "Failed to update sharing",
      "api/discover/games/[id]/sharing#PUT",
      { accountId },
    );
  }
}

import { NextResponse } from "next/server";

import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import { getGame, listGameVersions } from "@/services/games";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * The game's version history, newest first — lean entries only (id, chain
 * link, created_at). Version code is fetched per version on demand.
 */
export async function GET(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;

  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId, supabase } = auth;

  try {
    const game = await getGame(supabase, id);
    if (!game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    const versions = await listGameVersions(supabase, id);
    return NextResponse.json({ versions });
  } catch (error) {
    return serverErrorResponse(
      error,
      "Failed to list game versions",
      "api/games/[id]/versions#GET",
      { accountId },
    );
  }
}

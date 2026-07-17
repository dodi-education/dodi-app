import { NextResponse } from "next/server";

import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import { getGame, getGameSharing } from "@/services/games";

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
    const game = await getGame(supabase, id);
    if (!game || game.account_id !== accountId) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    const sharing = await getGameSharing(supabase, game.id);
    return NextResponse.json(sharing);
  } catch (error) {
    return serverErrorResponse(error, "Failed to fetch sharing", "api/games/[id]/sharing#GET", {
      accountId,
    });
  }
}

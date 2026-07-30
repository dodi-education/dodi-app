import { NextResponse } from "next/server";

import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import { serviceClient } from "@/lib/supabase";
import { getPublishedGameDetail } from "@/services/discover";
import {
  applyTranslation,
  getTranslation,
} from "@/services/game-translations";

/**
 * Full plaintext content of one published game — the Remix source (the client
 * re-seals it under its own vault and creates a private copy). Same projection
 * discipline as the list: no publisher ids, byline = publication_handle only.
 */
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

  // Viewer locale — localizes the system games (the only translated rows), so
  // a remix starts from the title/description the family actually sees.
  const locale = new URL(request.url).searchParams.get("locale") ?? "en";

  try {
    const game = await getPublishedGameDetail(serviceClient(), id);
    if (!game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }
    const translation = await getTranslation(supabase, id, locale);
    return NextResponse.json(applyTranslation(game, translation));
  } catch (error) {
    return serverErrorResponse(
      error,
      "Failed to fetch published game",
      "api/discover/games/[id]#GET",
      { accountId },
    );
  }
}

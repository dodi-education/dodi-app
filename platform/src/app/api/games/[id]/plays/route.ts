import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import { serviceClient } from "@/lib/supabase";
import { getPlayableGame, isGameVisibleToKid } from "@/services/games";
import { getKid } from "@/services/kids";
import { startPlay } from "@/services/game-plays";
import type { ProgressKind } from "@dodi/types/success";

const StartPlaySchema = z.object({
  kidId: z.string().uuid(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;

  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId, supabase } = auth;

  const body: unknown = await request.json();
  const parsed = StartPlaySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { kidId } = parsed.data;

  try {
    const kid = await getKid(supabase, kidId);
    if (!kid || kid.account_id !== accountId) {
      return NextResponse.json({ error: "Kid not found" }, { status: 404 });
    }

    // Published Discover rows belong to other accounts (RLS-hidden), hence the
    // service-role fallback; the play row itself is written with THIS family's
    // ids, so plays on a published game aggregate on its single row.
    const game = await getPlayableGame(supabase, serviceClient(), id);
    if (!game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    // Inactive / unshared games are not playable outside the parent studio.
    if (!(await isGameVisibleToKid(supabase, game, kid.id, accountId))) {
      return NextResponse.json({ error: "Game not available" }, { status: 403 });
    }

    const play = await startPlay(supabase, {
      accountId: accountId,
      kidId: kid.id,
      gameId: game.id,
      progressKind: game.progress_kind as ProgressKind,
    });

    return NextResponse.json({ playId: play.id }, { status: 201 });
  } catch (error) {
    return serverErrorResponse(error, "Failed to start play", "api/games/[id]/plays#POST", {
      accountId,
    });
  }
}

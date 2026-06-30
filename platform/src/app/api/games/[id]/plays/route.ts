import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { requireAuth } from "@/lib/resolve-auth";
import { getGame, isGameVisibleToKid } from "@/services/games";
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

    const game = await getGame(supabase, id);
    if (!game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    // Inactive / unshared games are not playable outside the parent studio.
    if (!(await isGameVisibleToKid(supabase, game, kid.id))) {
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
    const message = error instanceof Error ? error.message : "Failed to start play";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

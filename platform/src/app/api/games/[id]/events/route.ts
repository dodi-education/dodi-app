import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { requireAuth } from "@/lib/resolve-auth";
import { getGame } from "@/services/games";
import { getKid } from "@/services/kids";
import { logMemoryEvent } from "@/services/system-logs";
import { getTranslation, applyTranslation } from "@/services/game-translations";

const LogGameEventSchema = z.object({
  kidId: z.string().uuid(),
  event: z.enum(["game_played", "game_command_executed", "game_command_failed"]),
  message: z.string().min(1).max(800),
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
  const parsed = LogGameEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { kidId, event, message } = parsed.data;

  try {
    const kid = await getKid(supabase, kidId);
    if (!kid || kid.account_id !== accountId) {
      return NextResponse.json({ error: "Kid not found" }, { status: 404 });
    }

    const rawGame = await getGame(supabase, id);
    if (!rawGame) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    const gameTranslation = await getTranslation(supabase, rawGame.id, kid.language);
    const game = applyTranslation(rawGame, gameTranslation);

    await logMemoryEvent(supabase, {
      kid_id: kid.id,
      account_id: accountId,
      persona_id: kid.active_persona_id,
      event,
      message: `[${game.title}] ${message}`,
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "Failed to log event";
    return NextResponse.json({ error: messageText }, { status: 500 });
  }
}

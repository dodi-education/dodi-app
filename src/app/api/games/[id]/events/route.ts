import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { createClient } from "@/lib/supabase/server";
import { getGame } from "@/lib/services/games";
import { getProfile } from "@/lib/services/profiles";
import { logMemoryEvent } from "@/lib/services/system-logs";
import { getTranslation, applyTranslation } from "@/lib/services/game-translations";

const LogGameEventSchema = z.object({
  profileId: z.string().uuid(),
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: unknown = await request.json();
  const parsed = LogGameEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { profileId, event, message } = parsed.data;

  try {
    const profile = await getProfile(supabase, profileId);
    if (!profile || profile.account_id !== user.id) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const rawGame = await getGame(supabase, id);
    if (!rawGame) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    const gameTranslation = await getTranslation(supabase, rawGame.id, profile.language);
    const game = applyTranslation(rawGame, gameTranslation);

    await logMemoryEvent(supabase, {
      profile_id: profile.id,
      account_id: user.id,
      persona_id: profile.active_persona_id,
      event,
      message: `[${game.title}] ${message}`,
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "Failed to log event";
    return NextResponse.json({ error: messageText }, { status: 500 });
  }
}

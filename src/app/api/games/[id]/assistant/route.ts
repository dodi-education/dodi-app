import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { createClient } from "@/lib/supabase/server";
import { createLogger } from "@/lib/logger";
import { getProfile } from "@/lib/services/profiles";

const log = createLogger("game-assistant");
import { getGame } from "@/lib/services/games";
import { getMemory, getParentNotes } from "@/lib/services/memory";
import { getGlobalDefaultPersona, getPersona } from "@/lib/services/personas";
import {
  generateGameAssistantResponse,
} from "@/lib/services/game-assistant";
import { logMemoryEvent } from "@/lib/services/system-logs";
import { getTranslation, applyTranslation } from "@/lib/services/game-translations";

const AssistantRequestSchema = z.object({
  profileId: z.string().uuid(),
  message: z.string().min(1).max(4000),
  gameState: z.record(z.string(), z.unknown()).optional(),
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
  const parsed = AssistantRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { profileId, message, gameState } = parsed.data;
  log.info("chat_requested", { profileId, gameId: id, messageLength: message.length, hasGameState: !!gameState });

  try {
    const profile = await getProfile(supabase, profileId);
    if (!profile || profile.account_id !== user.id) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const rawGame = await getGame(supabase, id);
    if (!rawGame) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    const translation = await getTranslation(supabase, rawGame.id, profile.language);
    const game = applyTranslation(rawGame, translation);

    let persona = profile.active_persona_id
      ? await getPersona(supabase, profile.active_persona_id)
      : null;

    if (!persona) {
      persona = await getGlobalDefaultPersona(supabase);
    }

    if (!persona) {
      return NextResponse.json({ error: "No persona available" }, { status: 500 });
    }

    const [memory, parentNotes] = await Promise.all([
      getMemory(supabase, profile.id),
      getParentNotes(supabase, profile.id),
    ]);

    const response = await generateGameAssistantResponse(
      supabase,
      user.id,
      {
        personaSoul: persona.soul,
        childName: profile.display_name,
        childBirthdate: profile.birthdate,
        childLanguage: profile.language,
        memory,
        parentNotes,
        gameTitle: game.title,
        gameDescription: game.description,
        gameMarkdown: game.markdown,
        gameCodeBundle: game.code_bundle,
        gameState,
      },
      message,
    );

    log.debug("chat_exchange", {
      profileId,
      gameId: id,
      message,
      reply: response.reply,
      commands: response.commands,
    });
    log.info("chat_responded", {
      profileId,
      gameId: id,
      replyLength: response.reply.length,
      commandCount: response.commands.length,
      commandTypes: response.commands.map((c) => c.type),
    });

    if (response.commands.length > 0) {
      logMemoryEvent(supabase, {
        profile_id: profile.id,
        account_id: user.id,
        persona_id: persona.id,
        event: "game_command_executed",
        message: `Assistant emitted ${response.commands.length} command(s) for ${game.title}`,
      }).catch(() => {
        // non-blocking
      });
    }

    return NextResponse.json(response);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Failed to generate assistant reply";
    log.error("chat_failed", { profileId, gameId: id, error: errMsg });
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

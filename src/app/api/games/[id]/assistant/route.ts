import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/services/profiles";
import { getGame } from "@/lib/services/games";
import { getMemory, getParentNotes } from "@/lib/services/memory";
import { getGlobalDefaultPersona, getPersona } from "@/lib/services/personas";
import {
  generateGameAssistantResponse,
} from "@/lib/services/game-assistant";
import { logMemoryEvent } from "@/lib/services/system-logs";

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

  try {
    const profile = await getProfile(supabase, profileId);
    if (!profile || profile.account_id !== user.id) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const game = await getGame(supabase, id);
    if (!game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

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
        profile,
        personaSoul: persona.soul,
        memory,
        parentNotes,
        game,
        gameState,
        markdown: game.markdown,
        codeBundle: game.code_bundle,
      },
      message,
    );

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
    const message = error instanceof Error ? error.message : "Failed to generate assistant reply";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

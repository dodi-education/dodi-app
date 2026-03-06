import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/services/profiles";
import { getGame } from "@/lib/services/games";
import { getMemory, getParentNotes } from "@/lib/services/memory";
import { getGlobalDefaultPersona, getPersona } from "@/lib/services/personas";
import {
  buildGameVoiceSystemInstruction,
  buildGameVoiceToolDeclarations,
} from "@/lib/services/game-assistant";
import {
  decryptProviderKey,
  getModelConfig,
} from "@/lib/services/ai-providers";

const SessionRequestSchema = z.object({
  profileId: z.string().uuid(),
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
  const parsed = SessionRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { profileId, gameState } = parsed.data;

  try {
    const profile = await getProfile(supabase, profileId);
    if (!profile || profile.account_id !== user.id) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const game = await getGame(supabase, id);
    if (!game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    const modelConfig = await getModelConfig(supabase, user.id);
    if (!modelConfig) {
      return NextResponse.json(
        { error: "No AI provider configured" },
        { status: 400 },
      );
    }

    if (modelConfig.voiceProvider !== "gemini") {
      return NextResponse.json(
        { error: `Provider "${modelConfig.voiceProvider}" is not yet supported for live game voice` },
        { status: 400 },
      );
    }

    const apiKey = await decryptProviderKey(
      supabase,
      user.id,
      modelConfig.voiceProvider,
    );

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

    const systemInstruction = buildGameVoiceSystemInstruction({
      profile,
      personaSoul: persona.soul,
      memory,
      parentNotes,
      game,
      gameState,
      markdown: game.markdown,
      codeBundle: game.code_bundle,
    });

    const tools = buildGameVoiceToolDeclarations();

    return NextResponse.json({
      apiKey,
      model: modelConfig.voiceModel,
      voiceName: modelConfig.voiceName,
      systemInstruction,
      tools,
      language: profile.language,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create game voice session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

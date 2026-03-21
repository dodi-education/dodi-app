import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { createClient } from "@/lib/supabase/server";
import { createLogger } from "@/lib/logger";
import { getProfile } from "@/lib/services/profiles";

const log = createLogger("game-voice-session");
import { getGame } from "@/lib/services/games";
import { getMemory, getParentNotes } from "@/lib/services/memory";
import { getGlobalDefaultPersona, getPersona } from "@/lib/services/personas";
import { buildGameVoiceContext, isTodayBirthday } from "@/lib/services/dodi-context";
import {
  decryptProviderKey,
  getModelConfig,
  normalizeModelConfig,
} from "@/lib/services/ai-providers";
import { getTranslation, applyTranslation } from "@/lib/services/game-translations";
import { getOrCreateSession } from "@/lib/ai/agent-session";

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
  log.info("session_requested", { profileId, gameId: id });

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

    log.debug("persona_resolved", {
      profileId,
      personaId: persona.id,
      personaName: persona.name,
      isGlobalDefault: !profile.active_persona_id,
    });

    const { systemInstruction, tools } = buildGameVoiceContext({
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
    });

    log.debug("context_built", {
      profileId,
      gameId: id,
      gameTitle: game.title,
      systemInstructionLength: systemInstruction.length,
      toolCount: tools.length,
    });

    // Pre-warm agent session (non-blocking)
    const normalized = normalizeModelConfig(modelConfig);
    const thinkingProviderId = normalized.thinkingProvider ?? normalized.voiceProvider;
    const thinkingModel = normalized.thinkingModel ?? normalized.voiceModel;
    if (thinkingProviderId && thinkingModel) {
      decryptProviderKey(supabase, user.id, thinkingProviderId)
        .then((thinkingKey) => {
          getOrCreateSession(profile.id, thinkingKey, thinkingModel);
        })
        .catch(() => { /* log, don't block voice session */ });
    }

    log.info("session_created", { profileId, gameId: id, model: modelConfig.voiceModel });

    return NextResponse.json({
      apiKey,
      model: modelConfig.voiceModel,
      voiceName: modelConfig.voiceName,
      systemInstruction,
      tools,
      language: profile.language,
      isBirthday: isTodayBirthday(profile.birthdate),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create game voice session";
    log.error("session_failed", { profileId, gameId: id, error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

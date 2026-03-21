import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { createClient } from "@/lib/supabase/server";
import { createLogger } from "@/lib/logger";
import { getProfile } from "@/lib/services/profiles";

const log = createLogger("creation-voice-session");
import { getGame } from "@/lib/services/games";
import { getMemory, getParentNotes } from "@/lib/services/memory";
import { getGlobalDefaultPersona, getPersona } from "@/lib/services/personas";
import { buildGameCreationVoiceContext, isTodayBirthday } from "@/lib/services/dodi-context";
import {
  decryptProviderKey,
  getModelConfig,
  normalizeModelConfig,
} from "@/lib/services/ai-providers";
import { getTranslation, applyTranslation } from "@/lib/services/game-translations";
import { getOrCreateSession } from "@/lib/ai/agent-session";

const CreateSessionSchema = z.object({
  profileId: z.string().uuid(),
  gameId: z.string().uuid().optional(),
  gamePlan: z.string().optional(),
  gamePlanTitle: z.string().optional(),
  gamePlanSubject: z.string().optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: unknown = await request.json();
  const parsed = CreateSessionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { profileId, gameId } = parsed.data;
  log.info("session_requested", {
    profileId,
    gameId,
    hasGamePlan: !!parsed.data.gamePlan,
    isRemix: !!gameId,
  });

  try {
    const profile = await getProfile(supabase, profileId);
    if (!profile || profile.account_id !== user.id) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
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
        { error: `Provider "${modelConfig.voiceProvider}" is not yet supported for voice game creation` },
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

    // Fetch existing game for remix mode
    let existingGame: {
      title: string;
      description: string;
      markdown: string;
      codeBundle: string;
    } | undefined;

    if (gameId) {
      const rawGame = await getGame(supabase, gameId);
      if (!rawGame) {
        return NextResponse.json({ error: "Game not found" }, { status: 404 });
      }
      const translation = await getTranslation(supabase, rawGame.id, profile.language);
      const game = applyTranslation(rawGame, translation);
      existingGame = {
        title: game.title,
        description: game.description,
        markdown: game.markdown,
        codeBundle: game.code_bundle,
      };
    }

    const { systemInstruction, tools } = buildGameCreationVoiceContext({
      personaSoul: persona.soul,
      childName: profile.display_name,
      childBirthdate: profile.birthdate,
      childLanguage: profile.language,
      memory,
      parentNotes,
      existingGame,
      gamePlan: parsed.data.gamePlan,
      gamePlanTitle: parsed.data.gamePlanTitle,
      gamePlanSubject: parsed.data.gamePlanSubject,
    });

    log.debug("context_built", {
      profileId,
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

    log.info("session_created", { profileId, model: modelConfig.voiceModel });

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
    const message = error instanceof Error ? error.message : "Failed to create game creation session";
    log.error("session_failed", { profileId, error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

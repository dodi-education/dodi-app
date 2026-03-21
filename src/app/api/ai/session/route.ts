import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { createClient } from "@/lib/supabase/server";
import { createLogger } from "@/lib/logger";
import { getProfile } from "@/lib/services/profiles";

const log = createLogger("voice-session");
import {
  decryptProviderKey,
  getModelConfig,
} from "@/lib/services/ai-providers";
import { getGlobalDefaultPersona, getPersona } from "@/lib/services/personas";
import { getMemory, getParentNotes } from "@/lib/services/memory";
import { logMemoryEvent } from "@/lib/services/system-logs";
import { listGameCatalog } from "@/lib/services/games";
import { buildHomeVoiceContext, isTodayBirthday } from "@/lib/services/dodi-context";

const SessionRequestSchema = z.object({
  profileId: z.string().uuid(),
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
  const result = SessionRequestSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.issues },
      { status: 400 },
    );
  }

  const { profileId } = result.data;
  log.info("session_requested", { profileId });

  try {
    // Fetch the profile and verify ownership
    const profile = await getProfile(supabase, profileId);
    if (!profile || profile.account_id !== user.id) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    // Get the model config
    const modelConfig = await getModelConfig(supabase, user.id);
    if (!modelConfig) {
      return NextResponse.json(
        { error: "No AI provider configured" },
        { status: 400 },
      );
    }

    // Decrypt the API key for the voice provider
    const apiKey = await decryptProviderKey(
      supabase,
      user.id,
      modelConfig.voiceProvider,
    );

    // Fetch the active persona (or fall back to global default)
    let persona = profile.active_persona_id
      ? await getPersona(supabase, profile.active_persona_id)
      : null;
    if (!persona) {
      persona = await getGlobalDefaultPersona(supabase);
    }
    if (!persona) {
      return NextResponse.json(
        { error: "No persona available" },
        { status: 500 },
      );
    }

    log.debug("persona_resolved", {
      profileId,
      personaId: persona.id,
      personaName: persona.name,
      isGlobalDefault: !profile.active_persona_id,
    });

    // Fetch memory, parent notes, and game catalog
    const [memory, parentNotes, gameCatalog] = await Promise.all([
      getMemory(supabase, profileId),
      getParentNotes(supabase, profileId),
      listGameCatalog(supabase, profileId),
    ]);

    // Build system instruction + tools via centralized builder
    const { systemInstruction, tools } = buildHomeVoiceContext({
      personaSoul: persona.soul,
      childName: profile.display_name,
      childBirthdate: profile.birthdate,
      childLanguage: profile.language,
      memory,
      parentNotes,
      gameCatalog,
    });

    log.debug("context_built", {
      profileId,
      systemInstructionLength: systemInstruction.length,
      toolCount: tools.length,
      hasMemory: !!memory,
      gameCatalogCount: gameCatalog.length,
    });

    // Log session_start (non-blocking)
    logMemoryEvent(supabase, {
      profile_id: profileId,
      account_id: user.id,
      persona_id: persona.id,
      event: "session_start",
      message: `Voice session started with persona ${persona.name}`,
    }).catch(() => {
      // logging failure is non-critical
    });

    const isBirthday = isTodayBirthday(profile.birthdate);
    log.info("session_created", {
      profileId,
      model: modelConfig.voiceModel,
      voiceName: modelConfig.voiceName,
      isBirthday,
    });

    return NextResponse.json({
      apiKey,
      model: modelConfig.voiceModel,
      voiceName: modelConfig.voiceName,
      systemInstruction,
      language: profile.language,
      ...(tools.length > 0 ? { tools } : {}),
      isBirthday,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create session";
    log.error("session_failed", { profileId, error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

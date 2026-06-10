import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { createClient } from "@/lib/supabase/server";
import { createLogger } from "@/lib/logger";
import { getProfile } from "@/lib/services/profiles";

const log = createLogger("memory-update");
import {
  decryptProviderKey,
  getModelConfig,
  normalizeModelConfig,
} from "@/lib/services/ai-providers";
import { getGlobalDefaultPersona, getPersona } from "@/lib/services/personas";
import { processMemoryUpdate } from "@/lib/services/memory";

const MemoryUpdateSchema = z.object({
  profileId: z.string().uuid(),
  sessionTranscript: z.string().min(1).max(200000),
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
  const result = MemoryUpdateSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.issues },
      { status: 400 },
    );
  }

  const { profileId, sessionTranscript } = result.data;
  log.info("update_requested", { profileId, transcriptLength: sessionTranscript.length });
  log.debug("transcript_content", { profileId, sessionTranscript });

  try {
    // Verify profile ownership
    const profile = await getProfile(supabase, profileId);
    if (!profile || profile.account_id !== user.id) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    // Get the model config and decrypt API key
    const modelConfig = await getModelConfig(supabase, user.id);
    if (!modelConfig) {
      return NextResponse.json(
        { error: "No AI provider configured" },
        { status: 400 },
      );
    }

    const normalized = normalizeModelConfig(modelConfig);

    // Use thinking provider for memory updates (falls back to voice provider)
    const memoryProviderId = normalized.thinkingProvider ?? normalized.voiceProvider;
    const memoryModel = normalized.thinkingModel ?? "gemini-3.5-flash";

    log.debug("provider_resolved", { profileId, providerId: memoryProviderId, model: memoryModel });

    const apiKey = await decryptProviderKey(
      supabase,
      user.id,
      memoryProviderId,
    );

    // Fetch the active persona (or fall back to global default)
    let persona = profile.active_persona_id
      ? await getPersona(supabase, profile.active_persona_id)
      : null;
    if (!persona) {
      persona = await getGlobalDefaultPersona(supabase);
    }

    const updateResult = await processMemoryUpdate({
      supabase,
      profileId,
      accountId: user.id,
      personaId: persona?.id ?? null,
      personaSoul: persona?.soul ?? "",
      sessionTranscript,
      apiKey,
      providerId: memoryProviderId,
      model: memoryModel,
    });

    log.info("update_complete", {
      profileId,
      storedCount: updateResult.storedCount,
      discardedCount: updateResult.discardedCount,
    });

    return NextResponse.json({
      memory: updateResult.memory,
      storedCount: updateResult.storedCount,
      discardedCount: updateResult.discardedCount,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update memory";
    log.error("update_failed", { profileId, error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

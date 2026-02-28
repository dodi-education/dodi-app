import { NextResponse } from "next/server";
import { z } from "zod/v4";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, TranscriptCheckpoint } from "@/types/database";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/services/profiles";
import {
  decryptProviderKey,
  getModelConfig,
} from "@/lib/services/ai-providers";
import { getGlobalDefaultPersona, getPersona } from "@/lib/services/personas";
import { getMemory, getParentNotes, EMPTY_MEMORY_HINT, processMemoryUpdate } from "@/lib/services/memory";
import { logMemoryEvent } from "@/lib/services/system-logs";

const SessionRequestSchema = z.object({
  profileId: z.string().uuid(),
});

function buildSystemInstruction(
  soul: string,
  memory: string | null,
  parentNotes: string | null,
  name: string,
  birthdate: string | null,
  language: string,
): string {
  let ageClause = "";
  if (birthdate) {
    const birth = new Date(birthdate);
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const monthDiff = now.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
      age--;
    }
    if (age > 0) {
      ageClause = ` (${age} years old)`;
    }
  }

  const languageName =
    language === "de" ? "German" : "English";

  const sections: string[] = [soul];

  // Kid memory (or first-meeting hint)
  if (memory) {
    sections.push("", "## What You Know About This Child", memory);
  } else {
    sections.push("", "## First Meeting", EMPTY_MEMORY_HINT);
  }

  // Parent notes (read-only context)
  if (parentNotes) {
    sections.push("", "## Parent Notes", parentNotes);
  }

  // Session context
  sections.push(
    "",
    "## Current Session Context",
    `- Child's name: ${name}${ageClause}`,
    `- Language: ${languageName}`,
    `- Start by greeting ${name} by name`,
  );

  return sections.join("\n");
}

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

    // Fetch memory and parent notes
    const memory = await getMemory(supabase, profileId);
    const parentNotes = await getParentNotes(supabase, profileId);

    // Build the system instruction with persona soul + memory + kid context
    const systemInstruction = buildSystemInstruction(
      persona.soul,
      memory,
      parentNotes,
      profile.display_name,
      profile.birthdate,
      profile.language,
    );

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

    // Check for orphaned checkpoint and recover (non-blocking)
    recoverOrphanedCheckpoint(
      supabase,
      profileId,
      user.id,
      persona.id,
      persona.soul,
      apiKey,
    ).catch(() => {
      // recovery failure is non-critical
    });

    return NextResponse.json({
      apiKey,
      model: modelConfig.voiceModel,
      voiceName: modelConfig.voiceName,
      systemInstruction,
      language: profile.language,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Recover an orphaned transcript checkpoint for this profile. */
async function recoverOrphanedCheckpoint(
  supabase: SupabaseClient<Database>,
  profileId: string,
  accountId: string,
  personaId: string,
  personaSoul: string,
  apiKey: string,
): Promise<void> {
  // Check for checkpoint
  const { data: checkpointRow } = await supabase
    .from("transcript_checkpoints")
    .select("*")
    .eq("profile_id", profileId)
    .single();

  const checkpoint = checkpointRow as unknown as TranscriptCheckpoint | null;
  if (!checkpoint) return;

  // Delete first to prevent double-processing
  await supabase
    .from("transcript_checkpoints")
    .delete()
    .eq("profile_id", profileId);

  // Process the recovered transcript
  try {
    await processMemoryUpdate({
      supabase,
      profileId,
      accountId,
      personaId,
      personaSoul,
      sessionTranscript: checkpoint.transcript,
      apiKey,
    });

    await logMemoryEvent(supabase, {
      profile_id: profileId,
      account_id: accountId,
      persona_id: personaId,
      event: "checkpoint_recovered",
      message: `Recovered transcript from interrupted session${checkpoint.session_started_at ? ` (started ${new Date(checkpoint.session_started_at).toLocaleTimeString()})` : ""}`,
    });
  } catch (error) {
    await logMemoryEvent(supabase, {
      profile_id: profileId,
      account_id: accountId,
      persona_id: personaId,
      event: "error",
      message: `Checkpoint recovery failed: ${error instanceof Error ? error.message : "unknown error"}`,
    });
  }
}

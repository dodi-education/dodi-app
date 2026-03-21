import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { createClient } from "@/lib/supabase/server";
import { createLogger } from "@/lib/logger";
import { getProfile } from "@/lib/services/profiles";

const log = createLogger("voice-generate");
import {
  generateCustomGame,
  regenerateGame,
} from "@/lib/services/game-generation";
import { calculateChildAge, getLanguageDisplayName } from "@/lib/services/dodi-context";

const VoiceGenerateSchema = z.object({
  profileId: z.string().uuid(),
  prompt: z.string().min(1).max(10000),
  existingCodeBundle: z.string().optional(),
  existingMarkdown: z.string().optional(),
  title: z.string().max(200).optional(),
  subject: z.string().max(100).optional(),
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
  const parsed = VoiceGenerateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { profileId, prompt, existingCodeBundle, existingMarkdown, title, subject } =
    parsed.data;
  log.info("generation_requested", {
    profileId,
    promptLength: prompt.length,
    isUpdate: !!existingCodeBundle,
    title,
    subject,
  });
  log.debug("generation_prompt", { profileId, prompt });

  try {
    const profile = await getProfile(supabase, profileId);
    if (!profile || profile.account_id !== user.id) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const age = calculateChildAge(profile.birthdate) ?? undefined;
    const context = {
      profileName: profile.display_name,
      age,
      language: getLanguageDisplayName(profile.language),
    };

    let result;

    if (existingCodeBundle) {
      // Update mode — regenerate with instruction
      result = await regenerateGame(
        supabase,
        user.id,
        prompt,
        existingCodeBundle,
        existingMarkdown ?? "",
        context,
      );
    } else {
      // New game mode
      const fullPrompt = [
        prompt,
        title ? `Title suggestion: ${title}` : "",
        subject ? `Subject: ${subject}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      result = await generateCustomGame(supabase, user.id, fullPrompt, context);
    }

    log.info("generation_complete", {
      profileId,
      title: result.title,
      codeSizeChars: result.codeBundle.length,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Game generation failed";
    log.error("generation_failed", { profileId, error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

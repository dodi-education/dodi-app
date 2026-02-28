import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/services/profiles";
import {
  decryptProviderKey,
  getModelConfig,
} from "@/lib/services/ai-providers";

const SessionRequestSchema = z.object({
  profileId: z.string().uuid(),
});

function buildSystemInstruction(
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
      ageClause = `, who is ${age} years old`;
    }
  }

  const languageName =
    language === "de" ? "German" : "English";

  return [
    "You are Dodi, a friendly AI learning companion for kids.",
    `You are talking to ${name}${ageClause}.`,
    `Speak in ${languageName}. Be warm, playful, and encouraging.`,
    "Keep responses short and age-appropriate.",
    `Start by greeting ${name} by name.`,
  ].join("\n");
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

    // Build the system instruction with kid context
    const systemInstruction = buildSystemInstruction(
      profile.display_name,
      profile.birthdate,
      profile.language,
    );

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

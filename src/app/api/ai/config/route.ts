import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { createClient } from "@/lib/supabase/server";
import {
  getModelConfig,
  normalizeModelConfig,
  updateModelConfig,
} from "@/lib/services/ai-providers";
import type { AccountModelConfig } from "@/types/ai";

const providerEnum = z.enum(["gemini", "openai", "anthropic", "xai"]);

const UpdateConfigSchema = z.object({
  voiceProvider: providerEnum,
  voiceModel: z.string().min(1),
  voiceName: z.string().min(1),
  thinkingProvider: providerEnum.optional(),
  thinkingModel: z.string().min(1).optional(),
  // Legacy fields accepted for backward compat
  gameProvider: providerEnum.optional(),
  gameModel: z.string().min(1).optional(),
});

export async function GET(): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const config = await getModelConfig(supabase, user.id);
    // Normalize so clients always see `thinkingProvider`/`thinkingModel`
    // (migrated from the legacy gameProvider/gameModel shape at read time).
    return NextResponse.json(config ? normalizeModelConfig(config) : null);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch config" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: unknown = await request.json();
  const result = UpdateConfigSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.issues },
      { status: 400 },
    );
  }

  try {
    const config: AccountModelConfig = {
      voiceProvider: result.data.voiceProvider,
      voiceModel: result.data.voiceModel,
      voiceName: result.data.voiceName,
      thinkingProvider: result.data.thinkingProvider ?? result.data.gameProvider,
      thinkingModel: result.data.thinkingModel ?? result.data.gameModel,
    };
    await updateModelConfig(supabase, user.id, config);
    return NextResponse.json(config);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update config";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

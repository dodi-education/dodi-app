import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { createClient } from "@/lib/supabase/server";
import { getModelConfig, updateModelConfig } from "@/lib/services/ai-providers";
import type { AccountModelConfig } from "@/types/ai";

const UpdateConfigSchema = z.object({
  voiceProvider: z.enum(["gemini", "openai", "anthropic", "xai"]),
  voiceModel: z.string().min(1),
  voiceName: z.string().min(1),
  gameProvider: z.enum(["gemini", "openai", "anthropic", "xai"]).optional(),
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
    return NextResponse.json(config);
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
      gameProvider: result.data.gameProvider,
      gameModel: result.data.gameModel,
    };
    await updateModelConfig(supabase, user.id, config);
    return NextResponse.json(config);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update config";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

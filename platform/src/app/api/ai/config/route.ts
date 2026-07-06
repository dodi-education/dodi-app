import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { requireAuth } from "@/lib/resolve-auth";
import { getModelConfig, updateModelConfig } from "@/services/ai-providers";
import type { AccountModelConfig } from "@dodi/types/ai";

const providerEnum = z.enum(["gemini", "openai", "anthropic", "xai"]);

const UpdateConfigSchema = z.object({
  voiceProvider: providerEnum,
  voiceModel: z.string().min(1),
  voiceName: z.string().min(1),
  thinkingProvider: providerEnum.optional(),
  thinkingModel: z.string().min(1).optional(),
  gameProvider: providerEnum.optional(),
  gameModel: z.string().min(1).optional(),
  imageProvider: providerEnum.optional(),
  imageModel: z.string().min(1).optional(),
});

export async function GET(request: Request): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId, supabase } = auth;

  try {
    const config = await getModelConfig(supabase, accountId);
    return NextResponse.json(config);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch config" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId, supabase } = auth;

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
      thinkingProvider: result.data.thinkingProvider,
      thinkingModel: result.data.thinkingModel,
      gameProvider: result.data.gameProvider,
      gameModel: result.data.gameModel,
      imageProvider: result.data.imageProvider,
      imageModel: result.data.imageModel,
    };
    await updateModelConfig(supabase, accountId, config);
    return NextResponse.json(config);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update config";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

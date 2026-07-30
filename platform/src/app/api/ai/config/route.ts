import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import {
  clearModelConfig,
  getModelConfig,
  updateModelConfig,
} from "@/services/ai-providers";
import type { AccountModelConfig } from "@dodi/types/ai";

// "dodi" = the managed dodi AI meta-provider (resolved client-side to a real
// provider + dodi-minted key); it is a valid *selection*, never a vault key.
const providerEnum = z.enum(["gemini", "openai", "anthropic", "xai", "dodi"]);

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
  } catch (error) {
    return serverErrorResponse(error, "Failed to fetch config", "api/ai/config#GET", {
      accountId,
      expose: false,
    });
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
    return serverErrorResponse(error, "Failed to update config", "api/ai/config#PATCH", {
      accountId,
    });
  }
}

/**
 * Clear the whole model config. Used when dodi AI is disabled and no BYOK
 * provider exists to fall back to — the account returns to the unconfigured
 * state (same as before any provider was set up).
 */
export async function DELETE(request: Request): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId, supabase } = auth;

  try {
    await clearModelConfig(supabase, accountId);
    return NextResponse.json({ cleared: true });
  } catch (error) {
    return serverErrorResponse(error, "Failed to clear config", "api/ai/config#DELETE", {
      accountId,
    });
  }
}

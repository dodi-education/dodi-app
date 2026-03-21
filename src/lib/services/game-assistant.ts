import type { SupabaseClient } from "@supabase/supabase-js";

import { createLogger } from "@/lib/logger";
import type { Database, Json } from "@/types/database";

const log = createLogger("game-assistant-service");
import type { AIProviderId } from "@/types/ai";
import type { GameAssistantResponse, GameCommand } from "@/types/games";
import {
  decryptProviderKey,
  getModelConfig,
  normalizeModelConfig,
} from "@/lib/services/ai-providers";
import { buildGameTextContext, type GameContextInput } from "@/lib/services/dodi-context";
import { createThinkingProvider } from "@/lib/ai/thinking-providers/factory";

type Client = SupabaseClient<Database>;

interface ResolvedAssistantModel {
  providerId: AIProviderId;
  modelId: string;
  apiKey: string;
}

function normalizeCommands(raw: unknown): GameCommand[] {
  if (!Array.isArray(raw)) return [];

  const commands: GameCommand[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;

    const record = item as Record<string, unknown>;
    if (typeof record.type !== "string") continue;

    const payload =
      record.payload && typeof record.payload === "object" && !Array.isArray(record.payload)
        ? toJsonRecord(record.payload)
        : undefined;

    commands.push({
      type: record.type,
      payload,
    });

    if (commands.length >= 10) break;
  }

  return commands;
}

function toJsonValue(value: unknown): Json | undefined {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    const next: Json[] = [];
    for (const item of value) {
      const parsed = toJsonValue(item);
      if (parsed !== undefined) {
        next.push(parsed);
      }
    }
    return next;
  }

  if (typeof value === "object") {
    const next: Record<string, Json | undefined> = {};
    for (const [key, nested] of Object.entries(value)) {
      next[key] = toJsonValue(nested);
    }
    return next;
  }

  return undefined;
}

function toJsonRecord(value: unknown): Record<string, Json | undefined> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const next: Record<string, Json | undefined> = {};
  for (const [key, nested] of Object.entries(value)) {
    next[key] = toJsonValue(nested);
  }

  return next;
}

export async function resolveAssistantModel(
  supabase: Client,
  accountId: string,
): Promise<ResolvedAssistantModel> {
  const rawConfig = await getModelConfig(supabase, accountId);
  if (!rawConfig) {
    throw new Error("No AI model configuration found");
  }

  const modelConfig = normalizeModelConfig(rawConfig);

  const providerId = modelConfig.thinkingProvider ?? modelConfig.voiceProvider;
  const modelId = modelConfig.thinkingModel ?? modelConfig.voiceModel;

  if (!providerId || !modelId) {
    throw new Error("No model configured for game assistant");
  }

  const apiKey = await decryptProviderKey(supabase, accountId, providerId);

  return {
    providerId,
    modelId,
    apiKey,
  };
}

export async function generateGameAssistantResponse(
  supabase: Client,
  accountId: string,
  context: GameContextInput,
  kidMessage: string,
): Promise<GameAssistantResponse> {
  log.debug("generating", { gameTitle: context.gameTitle, messageLength: kidMessage.length });

  const model = await resolveAssistantModel(supabase, accountId);

  const { systemInstruction } = buildGameTextContext(context);

  const provider = createThinkingProvider(model.providerId, model.apiKey, model.modelId);
  const parsed = await provider.generateJson(systemInstruction, kidMessage);

  const reply =
    typeof parsed.reply === "string" && parsed.reply.trim().length > 0
      ? parsed.reply.trim()
      : "Let me help you with that!";

  const commands = normalizeCommands(parsed.commands);

  log.debug("ai_response", { replyLength: reply.length, commandCount: commands.length });

  return {
    reply,
    commands,
  };
}

export async function resolveGameVoiceSessionConfig(
  supabase: Client,
  accountId: string,
): Promise<ResolvedAssistantModel> {
  return resolveAssistantModel(supabase, accountId);
}

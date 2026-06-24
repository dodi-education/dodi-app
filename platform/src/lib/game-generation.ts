import { GoogleGenerativeAI } from "@google/generative-ai";
import type { SupabaseClient } from "@supabase/supabase-js";

import { THINKING_MODEL_REQUIRED_MESSAGE } from "@dodi/ai/thinking-config";
import {
  EMPTY_SUCCESS_CRITERIA,
  type MappedSuccess,
  coerceProgressKind,
  coerceSuccessCriteria,
} from "@dodi/games/game-spec";
import { SUCCESS_SYSTEM_TEMPLATE } from "@dodi/games/success";
import type { AIProviderId } from "@dodi/types/ai";
import type { Database } from "@dodi/types/database";

import {
  decryptProviderKey,
  getModelConfig,
  normalizeModelConfig,
} from "@/services/ai-providers";

type Client = SupabaseClient<Database>;

interface ResolvedGameModel {
  providerId: AIProviderId;
  modelId: string;
  apiKey: string;
}

function safeParseJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const parsed = JSON.parse(candidate) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Expected JSON object response");
  }
  return parsed as Record<string, unknown>;
}

async function resolveGameModel(
  supabase: Client,
  accountId: string,
): Promise<ResolvedGameModel> {
  const rawConfig = await getModelConfig(supabase, accountId);
  if (!rawConfig) {
    throw new Error(THINKING_MODEL_REQUIRED_MESSAGE);
  }

  const modelConfig = normalizeModelConfig(rawConfig);

  // Requires an explicit thinking model — no voice-provider fallback.
  const providerId = modelConfig.thinkingProvider;
  const modelId = modelConfig.thinkingModel;

  if (!providerId || !modelId) {
    throw new Error(THINKING_MODEL_REQUIRED_MESSAGE);
  }

  if (providerId !== "gemini") {
    throw new Error(`Provider "${providerId}" is not yet supported for single-shot game generation`);
  }

  const apiKey = await decryptProviderKey(supabase, accountId, providerId);

  return { providerId, modelId, apiKey };
}

async function runGeminiJson(
  apiKey: string,
  modelId: string,
  prompt: string,
): Promise<Record<string, unknown>> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelId,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.7,
    },
  });

  const response = await model.generateContent(prompt);
  const responseText = response.response.text().trim();

  if (!responseText) {
    throw new Error("Game generation returned an empty response");
  }

  return safeParseJsonObject(responseText);
}

/**
 * Map a parent's plain-language success definition onto a structured
 * SuccessCriteria — without regenerating the game. Used when a parent edits the
 * Success definition field in the Game Studio. An empty/whitespace definition
 * maps to open play.
 */
export async function mapSuccessDefinition(
  supabase: Client,
  accountId: string,
  successDefinition: string,
  context?: { learningGoal?: string },
): Promise<MappedSuccess> {
  if (!successDefinition.trim()) {
    return { progressKind: "open", successCriteria: EMPTY_SUCCESS_CRITERIA };
  }

  const model = await resolveGameModel(supabase, accountId);
  const prompt = [
    "Map a parent's plain-language game success definition onto a structured criteria object.",
    'Return ONLY JSON: { "progressKind": "goal" | "open", "successCriteria": { ... } }.',
    "",
    SUCCESS_SYSTEM_TEMPLATE,
    "",
    "successCriteria shape:",
    '{ "description": string, "match": "all" | "any", "conditions": [{ "metric": <MetricKey>, "op": ">="|">"|"<="|"<"|"=="|"!=", "value": number }], "requiredMetrics": [<MetricKey>] }',
    "Use ONLY the standardized metric keys. Map 'without asking Dodi' to hintsUsed == 0,",
    "'under N seconds each' to maxTaskMs <= N*1000, 'solve/get N' to correct >= N, etc.",
    "",
    context?.learningGoal ? `Learning goal: ${context.learningGoal}` : "",
    `Success definition: ${successDefinition}`,
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await runGeminiJson(model.apiKey, model.modelId, prompt);
  return {
    progressKind: coerceProgressKind(raw.progressKind),
    successCriteria: coerceSuccessCriteria(raw.successCriteria),
  };
}

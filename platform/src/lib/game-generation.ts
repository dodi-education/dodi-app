import { GoogleGenerativeAI } from "@google/generative-ai";

import {
  EMPTY_SUCCESS_CRITERIA,
  type MappedSuccess,
  coerceProgressKind,
  coerceSuccessCriteria,
} from "@dodi/games/game-spec";
import { SUCCESS_SYSTEM_TEMPLATE } from "@dodi/games/success";
import type { AIProviderId } from "@dodi/types/ai";

/**
 * The thinking provider/model plus its (vault-decrypted) API key. Under the E2EE
 * architecture the key lives only in the unlocked browser vault, so the caller
 * must resolve it client-side and pass it in — the server cannot decrypt it.
 */
export interface GameModelKey {
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
 * maps to open play (no model key needed).
 *
 * A non-empty definition requires the vault-decrypted thinking key, resolved by
 * the caller (`model`); a `null` model throws, signalling the route to persist
 * the text and leave the structured criteria unchanged.
 */
export async function mapSuccessDefinition(
  model: GameModelKey | null,
  successDefinition: string,
  context?: { learningGoal?: string },
): Promise<MappedSuccess> {
  if (!successDefinition.trim()) {
    return { progressKind: "open", successCriteria: EMPTY_SUCCESS_CRITERIA };
  }

  if (!model) {
    throw new Error("A thinking provider key is required to map a success definition");
  }

  if (model.providerId !== "gemini") {
    throw new Error(
      `Provider "${model.providerId}" is not yet supported for single-shot game generation`,
    );
  }

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

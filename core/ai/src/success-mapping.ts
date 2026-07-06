/**
 * Map a parent's plain-language success definition onto a structured
 * SuccessCriteria — without regenerating the game. Runs in the browser (the
 * provider key stays in the vault) via the shared client thinking provider, so
 * it works for any thinking-capable provider (Gemini, Anthropic, …).
 */

import {
  EMPTY_SUCCESS_CRITERIA,
  type MappedSuccess,
  coerceProgressKind,
  coerceSuccessCriteria,
} from "@dodi/games/game-spec";
import { SUCCESS_SYSTEM_TEMPLATE } from "@dodi/games/success";
import type { AIProviderId } from "@dodi/types/ai";

import { createClientThinkingProvider } from "./client-thinking";

/**
 * The thinking provider/model plus its (vault-decrypted) API key. Under the E2EE
 * architecture the key lives only in the unlocked browser vault, so the caller
 * resolves it client-side and passes it in — the server never sees it.
 */
export interface GameModelKey {
  providerId: AIProviderId;
  modelId: string;
  apiKey: string;
}

/**
 * An empty/whitespace definition maps to open play (no model key needed). A
 * non-empty definition requires the resolved thinking key; a `null` model throws
 * so the caller can persist the text and leave the structured criteria unchanged.
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

  const system = [
    "Map a parent's plain-language game success definition onto a structured criteria object.",
    'Return ONLY JSON: { "progressKind": "goal" | "open", "successCriteria": { ... } }.',
    "",
    SUCCESS_SYSTEM_TEMPLATE,
    "",
    "successCriteria shape:",
    '{ "description": string, "match": "all" | "any", "conditions": [{ "metric": <MetricKey>, "op": ">="|">"|"<="|"<"|"=="|"!=", "value": number }], "requiredMetrics": [<MetricKey>] }',
    "Use ONLY the standardized metric keys. Map 'without asking Dodi' to hintsUsed == 0,",
    "'under N seconds each' to maxTaskMs <= N*1000, 'solve/get N' to correct >= N, etc.",
  ].join("\n");

  const prompt = [
    context?.learningGoal ? `Learning goal: ${context.learningGoal}` : "",
    `Success definition: ${successDefinition}`,
  ]
    .filter(Boolean)
    .join("\n");

  const provider = createClientThinkingProvider(model.providerId, model.apiKey, model.modelId);
  const raw = await provider.generateJson(system, prompt);

  return {
    progressKind: coerceProgressKind(raw.progressKind),
    successCriteria: coerceSuccessCriteria(raw.successCriteria),
  };
}

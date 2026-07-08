/**
 * ThinkingProvider factory — creates the right provider based on config.
 */

import type { AIProviderId } from "@dodi/types/ai";

import { AnthropicThinkingProvider } from "./anthropic";
import { GeminiThinkingProvider } from "./gemini";
import { XaiThinkingProvider } from "./xai";

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface ThinkingProvider {
  generateJson(system: string, prompt: string): Promise<Record<string, unknown>>;
  generateText(system: string, prompt: string): Promise<string>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createThinkingProvider(
  providerId: AIProviderId,
  apiKey: string,
  model: string,
): ThinkingProvider {
  switch (providerId) {
    case "anthropic":
      return new AnthropicThinkingProvider(apiKey, model);
    case "gemini":
      return new GeminiThinkingProvider(apiKey, model);
    case "xai":
      return new XaiThinkingProvider(apiKey, model);
    default:
      throw new Error(`Provider "${providerId}" is not supported for thinking tasks`);
  }
}

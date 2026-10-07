/**
 * Shared Venice.ai constants + client helper.
 *
 * Venice exposes an OpenAI-compatible chat/completions API (tools, json_object,
 * vision) plus its own image endpoint (`/image/generate`). CORS is open, so
 * BYOK and dodi AI keys are used straight from the browser.
 *
 * Every chat request carries `venice_parameters`: Venice prepends its own
 * system prompt unless told not to (default true), which must never mix into
 * a kid-facing persona or the game agent's instructions. Web search is off by
 * default already; it is pinned off so a default change upstream can't leak
 * prompts to a search backend.
 */
import type OpenAI from "openai";

import { createProviderClient, type OpenAICompatibleProvider } from "./openai-compatible";

export const VENICE_BASE_URL = "https://api.venice.ai/api/v1";

export const VENICE_REQUEST_DEFAULTS = {
  venice_parameters: {
    include_venice_system_prompt: false,
    enable_web_search: "off",
  },
} as const;

/**
 * Claude models behind Venice need explicit `cache_control` breakpoints, as on
 * Anthropic's own API; every other Venice model caches automatically (or not
 * at all) and must not receive them.
 */
export function isVeniceClaudeModel(model: string): boolean {
  return model.startsWith("claude-");
}

export const VENICE_PROVIDER: OpenAICompatibleProvider = {
  id: "venice",
  label: "Venice",
  baseURL: VENICE_BASE_URL,
  extraBody: VENICE_REQUEST_DEFAULTS,
  needsCacheBreakpoints: isVeniceClaudeModel,
};

/** OpenAI SDK client pointed at Venice. `browser` enables `dangerouslyAllowBrowser`. */
export function createVeniceClient(apiKey: string, browser = false): OpenAI {
  return createProviderClient(VENICE_PROVIDER, apiKey, browser);
}

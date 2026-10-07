/**
 * Shared xAI (Grok) constants + client helper.
 *
 * xAI exposes an OpenAI-compatible REST surface (`/v1/chat/completions`,
 * `/v1/images/generations`) plus an OpenAI-Realtime-compatible voice WebSocket.
 * Text/image/agent calls reuse the `openai` SDK pointed at this base URL (see
 * openai-compatible.ts). Grok caches prompts automatically, so no breakpoints.
 */
import type OpenAI from "openai";

import { createProviderClient, type OpenAICompatibleProvider } from "./openai-compatible";

export const XAI_BASE_URL = "https://api.x.ai/v1";

export const XAI_PROVIDER: OpenAICompatibleProvider = {
  id: "xai",
  label: "xAI",
  baseURL: XAI_BASE_URL,
};

/** OpenAI SDK client pointed at xAI. `browser` enables `dangerouslyAllowBrowser`. */
export function createXaiClient(apiKey: string, browser = false): OpenAI {
  return createProviderClient(XAI_PROVIDER, apiKey, browser);
}

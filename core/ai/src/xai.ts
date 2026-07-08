/**
 * Shared xAI (Grok) constants + client helper.
 *
 * xAI exposes an OpenAI-compatible REST surface (`/v1/chat/completions`,
 * `/v1/images/generations`) plus an OpenAI-Realtime-compatible voice WebSocket.
 * Text/image/agent calls reuse the `openai` SDK pointed at this base URL. In the
 * browser (BYOK, E2EE) the vault key is passed in-memory and never reaches our
 * server, so client callers set `browser = true` (`dangerouslyAllowBrowser`);
 * node callers leave it off.
 */
import OpenAI from "openai";

export const XAI_BASE_URL = "https://api.x.ai/v1";

/** OpenAI SDK client pointed at xAI. `browser` enables `dangerouslyAllowBrowser`. */
export function createXaiClient(apiKey: string, browser = false): OpenAI {
  return new OpenAI({
    apiKey,
    baseURL: XAI_BASE_URL,
    dangerouslyAllowBrowser: browser,
  });
}

/**
 * Client-side AI provider key validation. Runs in the browser (the key is the
 * user's own, on their device) so the server never sees the plaintext key —
 * replacing the server `/api/ai/validate-key` route under E2EE.
 *
 * Note: Anthropic from the browser depends on CORS (`dangerouslyAllowBrowser`);
 * if it's blocked at runtime this returns the network error so the UI can show it.
 */
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";

import type { AIProviderId } from "@dodi/types/ai";

import { withExtraBody } from "./openai-compatible";
import { createVeniceClient, VENICE_PROVIDER } from "./venice";
import { createXaiClient } from "./xai";

/**
 * Cheap private Venice text model used to check a key: Venice keys are not
 * model-scoped, so the picked config model doesn't matter for auth, and a tiny
 * model keeps the 1-token probe at a fraction of a cent.
 */
const VENICE_VALIDATION_MODEL = "qwen3-5-9b";

export async function validateProviderKey(
  providerId: AIProviderId,
  apiKey: string,
  model: string,
): Promise<{ valid: boolean; error?: string }> {
  try {
    if (providerId === "gemini") {
      const client = new GoogleGenerativeAI(apiKey);
      await client.getGenerativeModel({ model }).generateContent("ping");
      return { valid: true };
    }
    if (providerId === "anthropic") {
      const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
      await client.messages.create({
        model,
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      });
      return { valid: true };
    }
    if (providerId === "xai") {
      // xAI is OpenAI-compatible; a 1-token completion on a text model checks
      // auth. The caller passes a non-voice model so this doesn't hit the
      // realtime-only voice endpoint.
      const client = createXaiClient(apiKey, true);
      await client.chat.completions.create({
        model,
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      });
      return { valid: true };
    }
    if (providerId === "venice") {
      const client = createVeniceClient(apiKey, true);
      await client.chat.completions.create(
        withExtraBody(VENICE_PROVIDER, {
          model: VENICE_VALIDATION_MODEL,
          max_tokens: 1,
          messages: [{ role: "user" as const, content: "ping" }],
        }),
      );
      return { valid: true };
    }
    return { valid: false, error: `Validation not supported for ${providerId}` };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Invalid API key",
    };
  }
}

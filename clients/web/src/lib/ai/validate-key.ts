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

import type { AIProviderId } from "@/types/ai";

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
    return { valid: false, error: `Validation not supported for ${providerId}` };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Invalid API key",
    };
  }
}

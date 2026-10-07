/**
 * OpenAI-compatible ThinkingProvider (server-side) for simple text/JSON tasks:
 * xAI Grok (api.x.ai) and Venice share the chat/completions shape, so both
 * reuse the `openai` SDK pointed at their base URL. Mirrors
 * AnthropicThinkingProvider; used for node flows that legitimately hold the key
 * (e.g. the publication security agent).
 */

import type OpenAI from "openai";

import { createProviderClient, withExtraBody, type OpenAICompatibleProvider } from "../openai-compatible";
import { VENICE_PROVIDER } from "../venice";
import { XAI_PROVIDER } from "../xai";
import type { ThinkingProvider } from "./factory";

export class OpenAICompatibleThinkingProvider implements ThinkingProvider {
  private provider: OpenAICompatibleProvider;
  private client: OpenAI;
  private model: string;

  constructor(provider: OpenAICompatibleProvider, apiKey: string, model: string) {
    this.provider = provider;
    this.client = createProviderClient(provider, apiKey);
    this.model = model;
  }

  async generateJson(
    system: string,
    prompt: string,
  ): Promise<Record<string, unknown>> {
    const response = await this.client.chat.completions.create(
      withExtraBody(this.provider, {
        model: this.model,
        response_format: { type: "json_object" as const },
        messages: [
          {
            role: "system" as const,
            content:
              system +
              "\n\nYou MUST respond with a single valid JSON object only. No markdown fences, no preamble.",
          },
          { role: "user" as const, content: prompt },
        ],
      }),
    );

    const text = response.choices[0]?.message?.content?.trim();
    if (!text) {
      throw new Error(`${this.provider.label} returned empty response`);
    }

    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1].trim() : text;

    const parsed: unknown = JSON.parse(candidate);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Expected JSON object response");
    }
    return parsed as Record<string, unknown>;
  }

  async generateText(system: string, prompt: string): Promise<string> {
    const response = await this.client.chat.completions.create(
      withExtraBody(this.provider, {
        model: this.model,
        messages: [
          { role: "system" as const, content: system },
          { role: "user" as const, content: prompt },
        ],
      }),
    );

    const text = response.choices[0]?.message?.content?.trim();
    if (!text) {
      throw new Error(`${this.provider.label} returned empty response`);
    }
    return text;
  }
}

/** xAI Grok (kept as a named class for existing imports). */
export class XaiThinkingProvider extends OpenAICompatibleThinkingProvider {
  constructor(apiKey: string, model: string) {
    super(XAI_PROVIDER, apiKey, model);
  }
}

/** Venice (OpenAI-compatible, with Venice's own system prompt disabled). */
export class VeniceThinkingProvider extends OpenAICompatibleThinkingProvider {
  constructor(apiKey: string, model: string) {
    super(VENICE_PROVIDER, apiKey, model);
  }
}

/**
 * xAI Grok ThinkingProvider (server-side) for simple text/JSON tasks.
 *
 * Grok exposes an OpenAI-compatible chat/completions API, so this reuses the
 * `openai` SDK pointed at api.x.ai. Mirrors AnthropicThinkingProvider; used for
 * node flows that legitimately hold the key (e.g. the future Hosted tier).
 */

import type OpenAI from "openai";

import { createXaiClient } from "../xai";
import type { ThinkingProvider } from "./factory";

export class XaiThinkingProvider implements ThinkingProvider {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = createXaiClient(apiKey);
    this.model = model;
  }

  async generateJson(
    system: string,
    prompt: string,
  ): Promise<Record<string, unknown>> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            system +
            "\n\nYou MUST respond with a single valid JSON object only. No markdown fences, no preamble.",
        },
        { role: "user", content: prompt },
      ],
    });

    const text = response.choices[0]?.message?.content?.trim();
    if (!text) {
      throw new Error("xAI returned empty response");
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
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    });

    const text = response.choices[0]?.message?.content?.trim();
    if (!text) {
      throw new Error("xAI returned empty response");
    }
    return text;
  }
}

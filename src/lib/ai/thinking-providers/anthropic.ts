/**
 * Anthropic Claude ThinkingProvider for simple text/JSON tasks.
 *
 * Used for memory updates, game text chat, and other non-agent tasks.
 */

import Anthropic from "@anthropic-ai/sdk";

import type { ThinkingProvider } from "./factory";

export class AnthropicThinkingProvider implements ThinkingProvider {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async generateJson(
    system: string,
    prompt: string,
  ): Promise<Record<string, unknown>> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: system + "\n\nYou MUST respond with valid JSON only. No markdown fences, no preamble.",
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock) {
      throw new Error("Anthropic returned empty response");
    }

    const text = textBlock.text.trim();
    // Try to extract JSON from markdown fences if present
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1].trim() : text;

    const parsed: unknown = JSON.parse(candidate);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Expected JSON object response");
    }
    return parsed as Record<string, unknown>;
  }

  async generateText(system: string, prompt: string): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock) {
      throw new Error("Anthropic returned empty response");
    }
    return textBlock.text.trim();
  }
}

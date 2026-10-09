/**
 * Browser-side "thinking" provider (non-voice LLM calls) for E2EE flows —
 * memory updates, game text chat, game generation. Mirrors the server
 * `ThinkingProvider` interface but runs in the browser so prompts built from
 * vault-decrypted child data never reach our server.
 *
 * Gemini (`@google/generative-ai`) is CORS-friendly from the browser. Anthropic
 * requires `dangerouslyAllowBrowser` and may be blocked by CORS depending on the
 * account/endpoint — validate before relying on it; otherwise a trusted home
 * companion (or a relay) handles Anthropic thinking.
 */
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type OpenAI from "openai";

import type { AIProviderId } from "@dodi/types/ai";
import type { TokenUsage } from "@dodi/types/usage";

import { createProviderClient, withExtraBody, type OpenAICompatibleProvider } from "./openai-compatible";
import { ANTHROPIC_SIMPLE_TASK_MAX_TOKENS } from "./providers";
import { anthropicUsage, geminiUsage, veniceUsage, xaiUsage } from "./usage-map";
import { VENICE_PROVIDER } from "./venice";
import { XAI_PROVIDER } from "./xai";

/** Fired after each underlying model call with that call's token usage. */
export type UsageSink = (usage: TokenUsage) => void;

export interface ThinkingProvider {
  generateJson(system: string, prompt: string): Promise<Record<string, unknown>>;
  generateText(system: string, prompt: string): Promise<string>;
}

function stripJsonFences(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : text).trim();
}

class GeminiClientThinking implements ThinkingProvider {
  #client: GoogleGenerativeAI;
  #model: string;
  #onUsage?: UsageSink;

  constructor(apiKey: string, model: string, onUsage?: UsageSink) {
    this.#client = new GoogleGenerativeAI(apiKey);
    this.#model = model;
    this.#onUsage = onUsage;
  }

  async generateJson(system: string, prompt: string): Promise<Record<string, unknown>> {
    const model = this.#client.getGenerativeModel({
      model: this.#model,
      systemInstruction: system,
      generationConfig: { responseMimeType: "application/json" },
    });
    const res = await model.generateContent(prompt);
    this.#onUsage?.(geminiUsage(res.response.usageMetadata));
    const parsed: unknown = JSON.parse(stripJsonFences(res.response.text()));
    if (typeof parsed !== "object" || parsed === null) {
      throw new Error("Gemini did not return a JSON object");
    }
    return parsed as Record<string, unknown>;
  }

  async generateText(system: string, prompt: string): Promise<string> {
    const model = this.#client.getGenerativeModel({
      model: this.#model,
      systemInstruction: system,
    });
    const res = await model.generateContent(prompt);
    this.#onUsage?.(geminiUsage(res.response.usageMetadata));
    return res.response.text().trim();
  }
}

class AnthropicClientThinking implements ThinkingProvider {
  #client: Anthropic;
  #model: string;
  #onUsage?: UsageSink;

  constructor(apiKey: string, model: string, onUsage?: UsageSink) {
    this.#client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
    this.#model = model;
    this.#onUsage = onUsage;
  }

  async #text(system: string, prompt: string): Promise<string> {
    const res = await this.#client.messages.create({
      model: this.#model,
      max_tokens: ANTHROPIC_SIMPLE_TASK_MAX_TOKENS,
      system,
      messages: [{ role: "user", content: prompt }],
    });
    this.#onUsage?.(anthropicUsage(res.usage));
    const block = res.content.find((b) => b.type === "text");
    return block && block.type === "text" ? block.text.trim() : "";
  }

  async generateJson(system: string, prompt: string): Promise<Record<string, unknown>> {
    const text = await this.#text(
      `${system}\n\nRespond with a single JSON object and nothing else.`,
      prompt,
    );
    const parsed: unknown = JSON.parse(stripJsonFences(text));
    if (typeof parsed !== "object" || parsed === null) {
      throw new Error("Anthropic did not return a JSON object");
    }
    return parsed as Record<string, unknown>;
  }

  generateText(system: string, prompt: string): Promise<string> {
    return this.#text(system, prompt);
  }
}

/** xAI / Venice — OpenAI-compatible chat/completions. */
class OpenAICompatibleClientThinking implements ThinkingProvider {
  #provider: OpenAICompatibleProvider;
  #client: OpenAI;
  #model: string;
  #onUsage?: UsageSink;

  constructor(provider: OpenAICompatibleProvider, apiKey: string, model: string, onUsage?: UsageSink) {
    this.#provider = provider;
    this.#client = createProviderClient(provider, apiKey, true);
    this.#model = model;
    this.#onUsage = onUsage;
  }

  async #text(system: string, prompt: string, jsonMode: boolean): Promise<string> {
    const res = await this.#client.chat.completions.create(
      withExtraBody(this.#provider, {
        model: this.#model,
        messages: [
          { role: "system" as const, content: system },
          { role: "user" as const, content: prompt },
        ],
        ...(jsonMode ? { response_format: { type: "json_object" as const } } : {}),
      }),
    );
    this.#onUsage?.(this.#provider.id === "venice" ? veniceUsage(res.usage) : xaiUsage(res.usage));
    return res.choices[0]?.message?.content?.trim() ?? "";
  }

  async generateJson(system: string, prompt: string): Promise<Record<string, unknown>> {
    // json_object mode requires the word "json" in the prompt (OpenAI contract).
    const text = await this.#text(
      `${system}\n\nRespond with a single JSON object and nothing else.`,
      prompt,
      true,
    );
    const parsed: unknown = JSON.parse(stripJsonFences(text));
    if (typeof parsed !== "object" || parsed === null) {
      throw new Error(`${this.#provider.label} did not return a JSON object`);
    }
    return parsed as Record<string, unknown>;
  }

  generateText(system: string, prompt: string): Promise<string> {
    return this.#text(system, prompt, false);
  }
}

export function createClientThinkingProvider(
  providerId: AIProviderId,
  apiKey: string,
  model: string,
  onUsage?: UsageSink,
): ThinkingProvider {
  switch (providerId) {
    case "gemini":
      return new GeminiClientThinking(apiKey, model, onUsage);
    case "anthropic":
      return new AnthropicClientThinking(apiKey, model, onUsage);
    case "xai":
      return new OpenAICompatibleClientThinking(XAI_PROVIDER, apiKey, model, onUsage);
    case "venice":
      return new OpenAICompatibleClientThinking(VENICE_PROVIDER, apiKey, model, onUsage);
    default:
      throw new Error(`Provider "${providerId}" is not supported for client-side thinking`);
  }
}

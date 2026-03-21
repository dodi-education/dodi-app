/**
 * Gemini ThinkingProvider for simple text/JSON tasks.
 *
 * Used for memory updates, game text chat, and other non-agent tasks.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

import type { ThinkingProvider } from "./factory";

export class GeminiThinkingProvider implements ThinkingProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async generateJson(
    system: string,
    prompt: string,
  ): Promise<Record<string, unknown>> {
    const genAI = new GoogleGenerativeAI(this.apiKey);
    const model = genAI.getGenerativeModel({
      model: this.model,
      systemInstruction: system,
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    const response = await model.generateContent(prompt);
    const text = response.response.text().trim();

    if (!text) {
      throw new Error("Gemini returned empty response");
    }

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
    const genAI = new GoogleGenerativeAI(this.apiKey);
    const model = genAI.getGenerativeModel({
      model: this.model,
      systemInstruction: system,
    });

    const response = await model.generateContent(prompt);
    const text = response.response.text().trim();

    if (!text) {
      throw new Error("Gemini returned empty response");
    }
    return text;
  }
}

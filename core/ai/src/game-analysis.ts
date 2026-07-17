/**
 * Game-state analysis ("what did the child make?") — runs fully in the browser
 * so the provider key never leaves the vault. Ported from the former server
 * `runAnalysisTask`. Supports Gemini, xAI Grok, and Anthropic vision; falls back
 * to the structured state description when no snapshot is available.
 */

import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type OpenAI from "openai";

import type { AIProviderId } from "@dodi/types/ai";
import type { TokenUsage } from "@dodi/types/usage";

import { parseImageDataUrl } from "./data-url";
import { anthropicUsage, geminiUsage, xaiUsage } from "./usage-map";
import { createXaiClient } from "./xai";

export interface AnalyzeGameStateParams {
  provider: AIProviderId;
  model: string;
  /** Vault-decrypted provider key. In-memory only. */
  apiKey: string;
  gameState: Record<string, unknown>;
  question: string;
  gameMarkdown?: string;
  gameCodeBundle?: string;
  /** data:image/... base64 snapshot of the game surface, when available. */
  snapshot?: string | null;
  /** Child display name (optional — decrypted client-side). */
  childName?: string;
  /** Response language display name (e.g. "English"). */
  language: string;
}

export async function analyzeGameState(
  params: AnalyzeGameStateParams,
): Promise<{ analysis: string; usage: TokenUsage }> {
  const { provider, model, apiKey, gameState, question, gameMarkdown, gameCodeBundle } = params;
  const snapshotImage = params.snapshot ? parseImageDataUrl(params.snapshot) : null;
  const hasSnapshot = !!snapshotImage;

  const userText = [`Question: ${question}`, "", "## Current Game State", JSON.stringify(gameState, null, 2)];
  if (gameMarkdown) {
    userText.push("", "## Game Documentation", gameMarkdown);
  }
  if (gameCodeBundle) {
    userText.push("", "## Game Source Code", "```html", gameCodeBundle, "```");
  }

  const name = params.childName?.trim();
  const systemPrompt = [
    "You are Dodi's vision helper, describing what a child made in a game.",
    hasSnapshot
      ? "A screenshot of the game is attached. Base your answer PRIMARILY on what you actually SEE in the image — recognize the shapes, objects, or scene the child drew/built (e.g. 'a heart', 'a house'). The structured game state and source code are only secondary hints; do NOT just read the raw state back to the child."
      : "No screenshot is available — describe the game from the structured state in natural, kid-friendly language.",
    name ? `The child's name is ${name}.` : "",
    `Respond in ${params.language}. Keep it to 2-3 short, warm sentences.`,
  ]
    .filter(Boolean)
    .join(" ");

  if (provider === "gemini") {
    const genAI = new GoogleGenerativeAI(apiKey);
    const genModel = genAI.getGenerativeModel({ model, systemInstruction: systemPrompt });
    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
    if (snapshotImage) {
      parts.push({ inlineData: { mimeType: snapshotImage.mediaType, data: snapshotImage.base64 } });
    }
    parts.push({ text: userText.join("\n") });
    const response = await genModel.generateContent(parts);
    const analysis =
      response.response.text().trim() || "I couldn't quite make it out this time.";
    return { analysis, usage: geminiUsage(response.response.usageMetadata) };
  }

  if (provider === "xai") {
    // xAI is OpenAI-compatible; Grok vision takes the snapshot as an image_url
    // content part (data URL passed through directly).
    const client = createXaiClient(apiKey, true);
    const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
    if (snapshotImage) {
      content.push({
        type: "image_url",
        image_url: { url: `data:${snapshotImage.mediaType};base64,${snapshotImage.base64}` },
      });
    }
    content.push({ type: "text", text: userText.join("\n") });
    const response = await client.chat.completions.create({
      model,
      max_tokens: 1024,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content },
      ],
    });
    const analysis =
      response.choices[0]?.message?.content?.trim() ||
      "I couldn't analyze the game state.";
    return { analysis, usage: xaiUsage(response.usage) };
  }

  // Anthropic
  const anthropic = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const content: Anthropic.Messages.ContentBlockParam[] = [];
  if (snapshotImage) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: snapshotImage.mediaType,
        data: snapshotImage.base64,
      },
    });
  }
  content.push({ type: "text", text: userText.join("\n") });
  const response = await anthropic.messages.create({
    model,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content }],
  });
  const textBlock = response.content.find((b) => b.type === "text");
  const analysis =
    textBlock && textBlock.type === "text"
      ? textBlock.text
      : "I couldn't analyze the game state.";
  return { analysis, usage: anthropicUsage(response.usage) };
}

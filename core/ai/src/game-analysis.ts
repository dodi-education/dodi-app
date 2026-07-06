/**
 * Game-state analysis ("what did the child make?") — runs fully in the browser
 * so the provider key never leaves the vault. Ported from the former server
 * `runAnalysisTask`. Supports Gemini + Anthropic vision; falls back to the
 * structured state description when no snapshot is available.
 */

import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";

import type { AIProviderId } from "@dodi/types/ai";

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

export async function analyzeGameState(params: AnalyzeGameStateParams): Promise<string> {
  const { provider, model, apiKey, gameState, question, gameMarkdown, gameCodeBundle } = params;
  const snapshotImage = params.snapshot
    ? params.snapshot.match(/^data:image\/(png|jpeg|gif|webp);base64,(.+)$/)
    : null;
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
      parts.push({ inlineData: { mimeType: `image/${snapshotImage[1]}`, data: snapshotImage[2] } });
    }
    parts.push({ text: userText.join("\n") });
    const response = await genModel.generateContent(parts);
    return response.response.text().trim() || "I couldn't quite make it out this time.";
  }

  // Anthropic (and any other future SDK-compatible provider)
  const anthropic = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const content: Anthropic.Messages.ContentBlockParam[] = [];
  if (snapshotImage) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: `image/${snapshotImage[1]}` as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
        data: snapshotImage[2],
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
  return textBlock && textBlock.type === "text"
    ? textBlock.text
    : "I couldn't analyze the game state.";
}

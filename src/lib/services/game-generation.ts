import { GoogleGenerativeAI } from "@google/generative-ai";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Game } from "@/types/database";
import type { AIProviderId } from "@/types/ai";
import type { GameMetadata } from "@/types/games";
import { sanitizeGameBundle } from "@/lib/game-sanitizer";
import {
  decryptProviderKey,
  getModelConfig,
  normalizeModelConfig,
} from "@/lib/services/ai-providers";

type Client = SupabaseClient<Database>;

export interface GeneratedGameDefinition {
  title: string;
  description: string;
  subject: string;
  difficulty: string;
  targetAgeMin: number;
  targetAgeMax: number;
  estimatedDurationMinutes: number;
  tags: string[];
  codeBundle: string;
  markdown: string;
  metadata: GameMetadata;
}

interface ResolvedGameModel {
  providerId: AIProviderId;
  modelId: string;
  apiKey: string;
}

interface GenerationContext {
  profileName: string;
  age?: number;
  language: string;
}

interface RemixContext extends GenerationContext {
  currentGame: Game;
  instruction: string;
  currentState?: Record<string, unknown>;
}

function safeParseJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const parsed = JSON.parse(candidate) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Expected JSON object response");
  }
  return parsed as Record<string, unknown>;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function toGameDefinition(raw: Record<string, unknown>): GeneratedGameDefinition {
  const codeBundleRaw = typeof raw.codeBundle === "string" ? raw.codeBundle : "";
  const sanitized = sanitizeGameBundle(codeBundleRaw);

  const metadata =
    raw.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata)
      ? (raw.metadata as GameMetadata)
      : {};

  return {
    title: typeof raw.title === "string" ? raw.title : "New Game",
    description:
      typeof raw.description === "string" ? raw.description : "Custom game created with Dodi",
    subject: typeof raw.subject === "string" ? raw.subject : "creativity",
    difficulty: typeof raw.difficulty === "string" ? raw.difficulty : "easy",
    targetAgeMin:
      typeof raw.targetAgeMin === "number"
        ? Math.max(1, Math.floor(raw.targetAgeMin))
        : 4,
    targetAgeMax:
      typeof raw.targetAgeMax === "number"
        ? Math.max(1, Math.floor(raw.targetAgeMax))
        : 12,
    estimatedDurationMinutes:
      typeof raw.estimatedDurationMinutes === "number"
        ? Math.max(1, Math.floor(raw.estimatedDurationMinutes))
        : 10,
    tags: toStringArray(raw.tags),
    codeBundle: sanitized.code,
    markdown: typeof raw.markdown === "string" ? raw.markdown : "",
    metadata,
  };
}

async function resolveGameModel(
  supabase: Client,
  accountId: string,
): Promise<ResolvedGameModel> {
  const rawConfig = await getModelConfig(supabase, accountId);
  if (!rawConfig) {
    throw new Error("No AI model configuration found");
  }

  const modelConfig = normalizeModelConfig(rawConfig);

  const providerId = modelConfig.thinkingProvider ?? modelConfig.voiceProvider;
  const modelId = modelConfig.thinkingModel ?? modelConfig.voiceModel;

  if (!providerId || !modelId) {
    throw new Error("No game model configured");
  }

  if (providerId !== "gemini") {
    throw new Error(`Provider "${providerId}" is not yet supported for single-shot game generation`);
  }

  const apiKey = await decryptProviderKey(supabase, accountId, providerId);

  return {
    providerId,
    modelId,
    apiKey,
  };
}

export const BRIDGE_INTERFACE_TEMPLATE = `
## Dodi Game Bridge Interface (REQUIRED)

The game MUST implement this postMessage bridge pattern:

1. Listen for 'message' events on window
2. On receiving 'dodi:init' message:
   - Store the bridge token from message.token
   - Send 'game:ready' to parent with { capabilities: string[], state: object }
3. On receiving 'dodi:command' message:
   - Execute the command from message.payload.command (has .type and .payload)
   - Send 'game:result' to parent with { command, result: { ok: boolean, error?: string }, state }
4. On receiving 'dodi:get_state' message:
   - Send 'game:state' to parent with the full current state object
5. Proactively send 'game:state' to parent:
   - After any user interaction that changes state (click, tap, drag end, key press)
   - After score, level, or progress changes
   - After timed events that change state (animation complete, countdown tick, round end)
   - Always send AFTER the change is applied, with the COMPLETE state object

Sending messages to parent:
  parent.postMessage({ type: 'game:ready|game:result|game:state|game:event|game:error', token: bridgeToken, payload: {...} }, '*');

The capabilities array in game:ready MUST list ALL command types the game supports.
The state object MUST include ALL meaningful game state (score, level, positions, selections, etc).
`.trim();

export const MARKDOWN_GENERATION_INSTRUCTION = `
Also generate a "markdown" key containing a markdown document for the AI companion. This document should include:
- Game Overview: what the game is about and how to play
- Rules: win/lose conditions, scoring, progression
- Available Commands: each command type with parameter names, types, allowed values, and a JSON example
- State Fields: what each field in the game state object means
- Teaching Strategy: how the AI companion should help the child (hints, encouragement, demonstrations)
Keep it concise but thorough — the AI reads this as a briefing document.
`.trim();

function buildGenerationPrompt(prompt: string, context: GenerationContext): string {
  const ageLine = context.age ? `- Child age: ${context.age}` : "- Child age: unknown";

  return [
    "Create a kid-safe HTML/CSS/JS game that runs entirely in a sandboxed iframe with no network access.",
    "Return only JSON with keys:",
    "title, description, subject, difficulty, targetAgeMin, targetAgeMax, estimatedDurationMinutes, tags, codeBundle, markdown, metadata",
    "",
    "Requirements:",
    "- No external scripts, no fetch, no XMLHttpRequest, no WebSocket, no dynamic import",
    "- Use inline <script> and inline <style> only",
    "- Keep code concise and under 200KB",
    "",
    BRIDGE_INTERFACE_TEMPLATE,
    "",
    MARKDOWN_GENERATION_INSTRUCTION,
    "",
    "Child context:",
    `- Child name: ${context.profileName}`,
    ageLine,
    `- Language: ${context.language}`,
    "",
    "User request:",
    prompt,
  ].join("\n");
}

function buildRemixPrompt(context: RemixContext): string {
  return [
    "You are remixing an existing kid-safe HTML/CSS/JS game.",
    "Return only JSON with keys:",
    "title, description, subject, difficulty, targetAgeMin, targetAgeMax, estimatedDurationMinutes, tags, codeBundle, markdown, metadata",
    "",
    "Hard requirements:",
    "- Keep it sandbox-safe: no external scripts, no network APIs, no dynamic imports",
    "- Keep code under 200KB",
    "",
    BRIDGE_INTERFACE_TEMPLATE,
    "",
    MARKDOWN_GENERATION_INSTRUCTION,
    "",
    "Current game metadata:",
    JSON.stringify(
      {
        title: context.currentGame.title,
        description: context.currentGame.description,
        subject: context.currentGame.subject,
        difficulty: context.currentGame.difficulty,
        targetAgeMin: context.currentGame.target_age_min,
        targetAgeMax: context.currentGame.target_age_max,
        estimatedDurationMinutes: context.currentGame.estimated_duration_minutes,
        tags: context.currentGame.tags,
        metadata: context.currentGame.metadata,
      },
      null,
      2,
    ),
    "",
    "Current game markdown:",
    context.currentGame.markdown || "(none)",
    "",
    "Current game code:",
    context.currentGame.code_bundle,
    "",
    "Current game state summary:",
    JSON.stringify(context.currentState ?? {}, null, 2),
    "",
    "Remix instruction:",
    context.instruction,
    "",
    "Child context:",
    `- Child name: ${context.profileName}`,
    context.age ? `- Child age: ${context.age}` : "- Child age: unknown",
    `- Language: ${context.language}`,
  ].join("\n");
}

async function runGeminiJson(
  apiKey: string,
  modelId: string,
  prompt: string,
): Promise<Record<string, unknown>> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelId,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.7,
    },
  });

  const response = await model.generateContent(prompt);
  const responseText = response.response.text().trim();

  if (!responseText) {
    throw new Error("Game generation returned an empty response");
  }

  return safeParseJsonObject(responseText);
}

export async function generateCustomGame(
  supabase: Client,
  accountId: string,
  prompt: string,
  context: GenerationContext,
): Promise<GeneratedGameDefinition> {
  const model = await resolveGameModel(supabase, accountId);
  const fullPrompt = buildGenerationPrompt(prompt, context);
  const raw = await runGeminiJson(model.apiKey, model.modelId, fullPrompt);

  return toGameDefinition(raw);
}

export async function remixCustomGame(
  supabase: Client,
  accountId: string,
  context: RemixContext,
): Promise<GeneratedGameDefinition> {
  const model = await resolveGameModel(supabase, accountId);
  const prompt = buildRemixPrompt(context);
  const raw = await runGeminiJson(model.apiKey, model.modelId, prompt);

  return toGameDefinition(raw);
}

function buildRegenerationPrompt(
  instruction: string,
  existingCode: string,
  existingMarkdown: string,
  context: GenerationContext,
): string {
  const ageLine = context.age ? `- Child age: ${context.age}` : "- Child age: unknown";

  return [
    "You are updating an existing kid-safe HTML/CSS/JS game based on a change instruction.",
    "Return only JSON with keys:",
    "title, description, subject, difficulty, targetAgeMin, targetAgeMax, estimatedDurationMinutes, tags, codeBundle, markdown, metadata",
    "",
    "Hard requirements:",
    "- Keep it sandbox-safe: no external scripts, no network APIs, no dynamic imports",
    "- Keep code under 200KB",
    "",
    BRIDGE_INTERFACE_TEMPLATE,
    "",
    MARKDOWN_GENERATION_INSTRUCTION,
    "",
    "Current game markdown:",
    existingMarkdown || "(none)",
    "",
    "Current game code:",
    existingCode,
    "",
    "Change instruction:",
    instruction,
    "",
    "Child context:",
    `- Child name: ${context.profileName}`,
    ageLine,
    `- Language: ${context.language}`,
  ].join("\n");
}

export async function regenerateGame(
  supabase: Client,
  accountId: string,
  instruction: string,
  existingCode: string,
  existingMarkdown: string,
  context: GenerationContext,
): Promise<GeneratedGameDefinition> {
  const model = await resolveGameModel(supabase, accountId);
  const fullPrompt = buildRegenerationPrompt(
    instruction,
    existingCode,
    existingMarkdown,
    context,
  );
  const raw = await runGeminiJson(model.apiKey, model.modelId, fullPrompt);

  return toGameDefinition(raw);
}

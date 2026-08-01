/**
 * AI usage/cost tracking DTOs — shared between the browser (which measures each
 * AI provider call and reports it) and the platform (which persists it). Token
 * counts + model/provider ids only; never any prompt/response content, so this
 * stays provider-blind.
 */

import type { AIProviderId } from "./ai";

/** Normalized per-call token split (nulls collapsed to 0 by the reporter). */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  /** Ephemeral cache written by this call (Anthropic only; 0 elsewhere). */
  cacheWriteTokens: number;
  /** Cached input reused from prior turns (Anthropic/Gemini; 0 elsewhere). */
  cacheReadTokens: number;
}

export type UsageEventType =
  | "game_create"
  | "game_edit"
  | "game_analysis"
  | "game_text_generation"
  | "memory_update"
  | "voice_minutes";

/**
 * What the client POSTs to /api/usage after an AI provider call. `account_id`
 * is stamped by the route from the auth token — never sent by the client.
 */
export interface UsageReport {
  eventType: UsageEventType;
  kidId?: string | null;
  gameId?: string | null;
  provider: AIProviderId;
  model: string;
  /** Token events (game_create/edit/analysis/memory_update). */
  usage?: TokenUsage;
  /** Voice events (voice_minutes) — Gemini Live exposes no tokens. */
  voiceSeconds?: number;
  /** Per-component context/output sizes measured client-side (see UsageMeta). */
  meta?: UsageMeta;
}

/**
 * Per-call sizes measured client-side and persisted as typed `ai_usage_logs.meta_*`
 * columns — one field per context component so we can track how they evolve across
 * users over time. All optional; each event type populates the subset it has.
 * Never content — only counts/lengths, so it stays provider-blind.
 */
export interface UsageMeta {
  /** Model round-trips in the game-agent loop. */
  turns?: number;
  /** Validation-retry writes in the game-agent loop. */
  validationRetries?: number;
  /** Chars of generated output (e.g. the sanitized game bundle). */
  outputChars?: number;
  /** Chars of the kid's memory dossier fed to the model. */
  memoryChars?: number;
  /** Chars of parent notes fed to the model. */
  parentNotesChars?: number;
  /** Chars of the game's learning goal. */
  learningGoalChars?: number;
  /** Chars of the game's success definition. */
  successDefChars?: number;
  /** Chars of the user's prompt/instruction. */
  promptChars?: number;
  /** Chars of the tags list. */
  tagsChars?: number;
  /** Chars of the persona soul fed to the model. */
  personaChars?: number;
}

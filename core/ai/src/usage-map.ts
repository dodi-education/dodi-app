/**
 * Normalize provider-specific SDK usage objects to the shared `TokenUsage`
 * shape. Structural param types so we don't depend on the exact SDK type names.
 */

import type { TokenUsage } from "@dodi/types/usage";

/** Gemini `response.usageMetadata` → TokenUsage (no cache-write concept). */
export function geminiUsage(
  m?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    cachedContentTokenCount?: number;
  } | null,
): TokenUsage {
  return {
    inputTokens: m?.promptTokenCount ?? 0,
    outputTokens: m?.candidatesTokenCount ?? 0,
    cacheWriteTokens: 0,
    cacheReadTokens: m?.cachedContentTokenCount ?? 0,
  };
}

/**
 * xAI / OpenAI-compatible `response.usage` → TokenUsage. Grok caches prompts
 * automatically; `prompt_tokens` is the full input (cached subset included), so
 * we mirror `geminiUsage`: total input in `inputTokens`, the cached slice in
 * `cacheReadTokens`, and no separate cache-write concept.
 */
export function xaiUsage(
  u?: {
    prompt_tokens?: number | null;
    completion_tokens?: number | null;
    prompt_tokens_details?: { cached_tokens?: number | null } | null;
  } | null,
): TokenUsage {
  return {
    inputTokens: u?.prompt_tokens ?? 0,
    outputTokens: u?.completion_tokens ?? 0,
    cacheWriteTokens: 0,
    cacheReadTokens: u?.prompt_tokens_details?.cached_tokens ?? 0,
  };
}

/** Anthropic `response.usage` → TokenUsage. */
export function anthropicUsage(
  u?: {
    input_tokens?: number | null;
    output_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
    cache_read_input_tokens?: number | null;
  } | null,
): TokenUsage {
  return {
    inputTokens: u?.input_tokens ?? 0,
    outputTokens: u?.output_tokens ?? 0,
    cacheWriteTokens: u?.cache_creation_input_tokens ?? 0,
    cacheReadTokens: u?.cache_read_input_tokens ?? 0,
  };
}

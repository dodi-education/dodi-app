import { describe, expect, it } from "vitest";

import { anthropicUsage, geminiUsage, xaiUsage } from "./usage-map";

describe("xaiUsage", () => {
  it("maps OpenAI-shaped usage to TokenUsage with cached input in cacheReadTokens", () => {
    expect(
      xaiUsage({
        prompt_tokens: 100,
        completion_tokens: 40,
        prompt_tokens_details: { cached_tokens: 30 },
      }),
    ).toEqual({
      inputTokens: 100,
      outputTokens: 40,
      cacheWriteTokens: 0,
      cacheReadTokens: 30,
    });
  });

  it("defaults every field to 0 when usage is missing", () => {
    expect(xaiUsage(undefined)).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
    });
    expect(xaiUsage({ prompt_tokens: 5, completion_tokens: 2 }).cacheReadTokens).toBe(0);
  });

  it("stays consistent with the other providers' normalizers", () => {
    // All three normalize to the same shape (Gemini/xAI have no cache-write).
    expect(geminiUsage({ promptTokenCount: 1, candidatesTokenCount: 2 })).toEqual({
      inputTokens: 1,
      outputTokens: 2,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
    });
    expect(anthropicUsage({ input_tokens: 1, output_tokens: 2 })).toEqual({
      inputTokens: 1,
      outputTokens: 2,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
    });
  });
});

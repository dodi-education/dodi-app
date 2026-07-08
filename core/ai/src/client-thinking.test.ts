import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the OpenAI SDK so the xAI thinking provider runs without network.
const create = vi.fn();
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create } };
    constructor(_opts?: unknown) {}
  },
}));

import { createClientThinkingProvider } from "./client-thinking";

beforeEach(() => {
  create.mockReset();
});

describe("XaiClientThinking", () => {
  it("generateText returns trimmed content and reports normalized usage", async () => {
    create.mockResolvedValueOnce({
      choices: [{ message: { content: "  hello  " } }],
      usage: { prompt_tokens: 7, completion_tokens: 3 },
    });
    const usages: unknown[] = [];
    const provider = createClientThinkingProvider("xai", "k", "grok-4.3", (u) =>
      usages.push(u),
    );

    const text = await provider.generateText("SYS", "hi");
    expect(text).toBe("hello");
    expect(usages).toEqual([
      { inputTokens: 7, outputTokens: 3, cacheWriteTokens: 0, cacheReadTokens: 0 },
    ]);

    const args = create.mock.calls[0][0] as {
      model: string;
      messages: Array<{ role: string; content: string }>;
      response_format?: unknown;
    };
    expect(args.model).toBe("grok-4.3");
    expect(args.messages).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "hi" },
    ]);
    expect(args.response_format).toBeUndefined();
  });

  it("generateJson requests json_object mode and parses fenced JSON", async () => {
    create.mockResolvedValueOnce({
      choices: [{ message: { content: "```json\n{\"n\": 42}\n```" } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });
    const provider = createClientThinkingProvider("xai", "k", "grok-4.3");

    const obj = await provider.generateJson("SYS", "give json");
    expect(obj).toEqual({ n: 42 });

    const args = create.mock.calls[0][0] as { response_format?: { type: string } };
    expect(args.response_format).toEqual({ type: "json_object" });
  });
});

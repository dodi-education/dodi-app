import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock both SDKs so we can assert which provider path is taken (and avoid network).
const openaiCreate = vi.fn();
const anthropicCreate = vi.fn();

vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: openaiCreate } };
    constructor(_opts?: unknown) {}
  },
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: anthropicCreate };
    constructor(_opts?: unknown) {}
  },
}));

import { analyzeGameState } from "./game-analysis";

beforeEach(() => {
  openaiCreate.mockReset();
  anthropicCreate.mockReset();
});

describe("analyzeGameState", () => {
  it("routes xai analysis through the OpenAI-compatible endpoint (not Anthropic)", async () => {
    // Regression: xAI thinking provider used to fall through to the Anthropic SDK
    // and 401 with "invalid x-api-key".
    openaiCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "You drew a bright red heart!" } }],
      usage: { prompt_tokens: 30, completion_tokens: 12 },
    });

    const res = await analyzeGameState({
      provider: "xai",
      model: "grok-4.3",
      apiKey: "xai-key",
      gameState: { shapes: ["heart"] },
      question: "what did I draw?",
      snapshot: "data:image/png;base64,QUJD",
      language: "English",
    });

    expect(res.analysis).toBe("You drew a bright red heart!");
    expect(res.usage).toEqual({
      inputTokens: 30,
      outputTokens: 12,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
    });
    expect(anthropicCreate).not.toHaveBeenCalled();

    // The snapshot must be forwarded as an OpenAI image_url content part.
    const args = openaiCreate.mock.calls[0][0] as {
      model: string;
      messages: Array<{ role: string; content: unknown }>;
    };
    expect(args.model).toBe("grok-4.3");
    const userMsg = args.messages.find((m) => m.role === "user");
    const parts = userMsg?.content as Array<{ type: string; image_url?: { url: string } }>;
    const imagePart = parts.find((p) => p.type === "image_url");
    expect(imagePart?.image_url?.url).toBe("data:image/png;base64,QUJD");
  });

  it("still routes anthropic analysis through the Anthropic SDK", async () => {
    anthropicCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "A tall green tower." }],
      usage: { input_tokens: 20, output_tokens: 8 },
    });

    const res = await analyzeGameState({
      provider: "anthropic",
      model: "claude-x",
      apiKey: "sk-ant",
      gameState: {},
      question: "what is this?",
      language: "English",
    });

    expect(res.analysis).toBe("A tall green tower.");
    expect(openaiCreate).not.toHaveBeenCalled();
  });
});

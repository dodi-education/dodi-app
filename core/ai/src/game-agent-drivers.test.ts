import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the OpenAI SDK so the xAI driver runs without network. `createXaiClient`
// constructs `new OpenAI(...)`, so its `.chat.completions.create` is this mock.
const create = vi.fn();
vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = { completions: { create } };
    constructor(_opts?: unknown) {}
  },
}));

import { AGENT_TOOLS, buildAgentTools } from "./game-agent-tools";
import {
  createGameDriver,
  toAnthropicContent,
  toOpenAITools,
  toXaiContent,
} from "./game-agent-drivers";

beforeEach(() => {
  create.mockReset();
});

describe("toOpenAITools", () => {
  it("maps Anthropic tool defs to OpenAI function tools", () => {
    const tools = toOpenAITools(AGENT_TOOLS);
    expect(tools).toHaveLength(AGENT_TOOLS.length);
    tools.forEach((t, i) => {
      expect(t.type).toBe("function");
      if (t.type !== "function") return;
      expect(t.function.name).toBe(AGENT_TOOLS[i].name);
      expect(t.function.description).toBe(AGENT_TOOLS[i].description);
      expect(t.function.parameters).toBe(AGENT_TOOLS[i].input_schema);
    });
    // The agent must be able to emit and validate code.
    const names = tools.map((t) => (t.type === "function" ? t.function.name : ""));
    expect(names).toContain("write_game_code");
    expect(names).toContain("validate_game");
  });
});

describe("createGameDriver", () => {
  it("returns a driver for agentic providers", () => {
    for (const provider of ["xai", "anthropic"] as const) {
      const driver = createGameDriver(provider, {
        apiKey: "k",
        model: "m",
        systemPrompt: "s",
        maxTokens: 10,
      });
      expect(driver.seed).toBeTypeOf("function");
      expect(driver.runTurn).toBeTypeOf("function");
      expect(driver.addToolResults).toBeTypeOf("function");
    }
  });

  it("throws for providers without game (tool-use) support", () => {
    expect(() =>
      createGameDriver("gemini", { apiKey: "k", model: "m", systemPrompt: "s", maxTokens: 10 }),
    ).toThrow(/does not support game generation/);
  });
});

describe("XaiGameDriver", () => {
  it("parses tool calls, normalizes usage, and appends tool results in OpenAI shape", async () => {
    create.mockResolvedValueOnce({
      choices: [
        {
          finish_reason: "tool_calls",
          message: {
            role: "assistant",
            content: "",
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: { name: "read_bridge_docs", arguments: "{}" },
              },
            ],
          },
        },
      ],
      usage: { prompt_tokens: 12, completion_tokens: 4, prompt_tokens_details: { cached_tokens: 3 } },
    });

    const driver = createGameDriver("xai", {
      apiKey: "k",
      model: "grok-4.3",
      systemPrompt: "SYS",
      maxTokens: 100,
    });
    driver.seed(undefined, "make a counting game");

    const turn = await driver.runTurn();
    expect(turn.toolCalls).toEqual([{ id: "call_1", name: "read_bridge_docs", input: {} }]);
    expect(turn.expectsToolResults).toBe(true);
    expect(turn.hasText).toBe(false);
    expect(turn.usage).toEqual({
      inputTokens: 12,
      outputTokens: 4,
      cacheWriteTokens: 0,
      cacheReadTokens: 3,
    });

    // First request seeds a system + user message and forwards the tools.
    const first = create.mock.calls[0][0] as {
      messages: Array<{ role: string; content?: unknown }>;
      tools: unknown[];
      tool_choice: string;
    };
    expect(first.messages.map((m) => m.role)).toEqual(["system", "user"]);
    expect(first.messages[0]).toEqual({ role: "system", content: "SYS" });
    expect(first.tool_choice).toBe("auto");
    expect(first.tools).toHaveLength(AGENT_TOOLS.length);

    driver.addToolResults([{ id: "call_1", content: "bridge docs" }]);

    create.mockResolvedValueOnce({
      choices: [{ finish_reason: "stop", message: { role: "assistant", content: "all done" } }],
      usage: { prompt_tokens: 2, completion_tokens: 1 },
    });
    const turn2 = await driver.runTurn();
    expect(turn2.toolCalls).toEqual([]);
    expect(turn2.hasText).toBe(true);
    expect(turn2.expectsToolResults).toBe(false);

    // The second request must carry the assistant tool_call turn + its tool result
    // (OpenAI requires each tool_call to be answered by a role:"tool" message).
    const second = create.mock.calls[1][0] as {
      messages: Array<{ role: string; tool_call_id?: string; content?: unknown }>;
    };
    expect(second.messages.map((m) => m.role)).toEqual(["system", "user", "assistant", "tool"]);
    expect(second.messages[3]).toEqual({
      role: "tool",
      tool_call_id: "call_1",
      content: "bridge docs",
    });
  });

  it("coerces malformed tool-call arguments to an empty object", async () => {
    create.mockResolvedValueOnce({
      choices: [
        {
          finish_reason: "tool_calls",
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "c1",
                type: "function",
                function: { name: "write_game_code", arguments: "not json" },
              },
            ],
          },
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });

    const driver = createGameDriver("xai", {
      apiKey: "k",
      model: "grok-4.3",
      systemPrompt: "s",
      maxTokens: 10,
    });
    driver.seed(undefined, "go");
    const turn = await driver.runTurn();
    expect(turn.toolCalls).toEqual([{ id: "c1", name: "write_game_code", input: {} }]);
  });
});

const PNG = "data:image/png;base64,AAAA";
const JPEG = "data:image/jpeg;base64,BBBB";

describe("content mappers", () => {
  it("text-only content stays a plain string", () => {
    expect(toAnthropicContent("hello")).toBe("hello");
    expect(toAnthropicContent({ text: "hello" })).toBe("hello");
    expect(toXaiContent({ text: "hello", images: [] })).toBe("hello");
  });

  it("invalid attachments are dropped (falls back to plain text)", () => {
    expect(toAnthropicContent({ text: "hi", images: ["nonsense", "data:text/plain;base64,x"] })).toBe(
      "hi",
    );
  });

  it("toAnthropicContent puts image blocks first, text last", () => {
    const content = toAnthropicContent({ text: "match this style", images: [PNG, JPEG] });
    expect(content).toEqual([
      { type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } },
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "BBBB" } },
      { type: "text", text: "match this style" },
    ]);
  });

  it("toXaiContent maps images to image_url parts with the raw data URL", () => {
    const content = toXaiContent({ text: "match this style", images: [PNG] });
    expect(content).toEqual([
      { type: "image_url", image_url: { url: PNG } },
      { type: "text", text: "match this style" },
    ]);
  });
});

describe("driver toolset override", () => {
  it("xAI driver forwards the run's toolset to the request", async () => {
    create.mockResolvedValueOnce({
      choices: [{ finish_reason: "stop", message: { role: "assistant", content: "ok" } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });
    const driver = createGameDriver("xai", {
      apiKey: "k",
      model: "grok-4.3",
      systemPrompt: "s",
      maxTokens: 10,
      tools: buildAgentTools({ backgroundImage: true }),
    });
    driver.seed(undefined, "go");
    await driver.runTurn();
    const req = create.mock.calls[0][0] as { tools: Array<{ function: { name: string } }> };
    expect(req.tools).toHaveLength(AGENT_TOOLS.length + 1);
    expect(req.tools.map((t) => t.function.name)).toContain("generate_background_image");
  });
});

describe("XaiGameDriver image seeding", () => {
  it("prior user turns and the first message carry image parts", async () => {
    create.mockResolvedValueOnce({
      choices: [{ finish_reason: "stop", message: { role: "assistant", content: "ok" } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });

    const driver = createGameDriver("xai", {
      apiKey: "k",
      model: "grok-4.3",
      systemPrompt: "SYS",
      maxTokens: 10,
    });
    driver.seed(
      [
        { role: "user", text: "earlier prompt", images: [PNG] },
        { role: "assistant", text: "earlier reply" },
      ],
      { text: "update it", images: [JPEG] },
    );
    await driver.runTurn();

    const req = create.mock.calls[0][0] as {
      messages: Array<{ role: string; content: unknown }>;
    };
    expect(req.messages.map((m) => m.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(req.messages[1].content).toEqual([
      { type: "image_url", image_url: { url: PNG } },
      { type: "text", text: "earlier prompt" },
    ]);
    expect(req.messages[2].content).toBe("earlier reply");
    expect(req.messages[3].content).toEqual([
      { type: "image_url", image_url: { url: JPEG } },
      { type: "text", text: "update it" },
    ]);
  });
});

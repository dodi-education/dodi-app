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

import type Anthropic from "@anthropic-ai/sdk";
import type { AgentActivityEvent } from "@dodi/types/agent-progress";

import { AGENT_TOOLS, buildAgentTools } from "./game-agent-tools";
import {
  createAnthropicActivityHandler,
  createGameDriver,
  createXaiTurnAccumulator,
  toAnthropicContent,
  toOpenAITools,
  toXaiContent,
} from "./game-agent-drivers";

beforeEach(() => {
  create.mockReset();
});

/** Minimal async-iterable standing in for the SDK's chat-completions stream. */
function streamOf(...chunks: unknown[]): AsyncIterable<unknown> {
  return {
    async *[Symbol.asyncIterator]() {
      yield* chunks;
    },
  };
}

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
  it("parses streamed tool calls, normalizes usage, and appends tool results in OpenAI shape", async () => {
    create.mockResolvedValueOnce(
      streamOf(
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: "call_1",
                    type: "function",
                    function: { name: "read_bridge_docs", arguments: "" },
                  },
                ],
              },
            },
          ],
        },
        {
          choices: [
            {
              delta: { tool_calls: [{ index: 0, function: { arguments: "{}" } }] },
              finish_reason: "tool_calls",
            },
          ],
        },
        // Usage rides the final chunk (stream_options.include_usage).
        {
          choices: [],
          usage: {
            prompt_tokens: 12,
            completion_tokens: 4,
            prompt_tokens_details: { cached_tokens: 3 },
          },
        },
      ),
    );

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

    // First request seeds a system + user message, forwards the tools, streams.
    const first = create.mock.calls[0][0] as {
      messages: Array<{ role: string; content?: unknown }>;
      tools: unknown[];
      tool_choice: string;
      stream: boolean;
      stream_options: unknown;
    };
    expect(first.messages.map((m) => m.role)).toEqual(["system", "user"]);
    expect(first.messages[0]).toEqual({ role: "system", content: "SYS" });
    expect(first.tool_choice).toBe("auto");
    expect(first.tools).toHaveLength(AGENT_TOOLS.length);
    expect(first.stream).toBe(true);
    expect(first.stream_options).toEqual({ include_usage: true });

    driver.addToolResults([{ id: "call_1", content: "bridge docs" }]);

    create.mockResolvedValueOnce(
      streamOf(
        { choices: [{ delta: { content: "all done" }, finish_reason: "stop" }] },
        { choices: [], usage: { prompt_tokens: 2, completion_tokens: 1 } },
      ),
    );
    const turn2 = await driver.runTurn();
    expect(turn2.toolCalls).toEqual([]);
    expect(turn2.hasText).toBe(true);
    expect(turn2.expectsToolResults).toBe(false);

    // The second request must carry the reassembled assistant tool_call turn +
    // its tool result (OpenAI requires each tool_call to be answered).
    const second = create.mock.calls[1][0] as {
      messages: Array<{ role: string; tool_call_id?: string; content?: unknown }>;
    };
    expect(second.messages.map((m) => m.role)).toEqual(["system", "user", "assistant", "tool"]);
    expect(second.messages[2]).toEqual({
      role: "assistant",
      content: "",
      tool_calls: [
        { id: "call_1", type: "function", function: { name: "read_bridge_docs", arguments: "{}" } },
      ],
    });
    expect(second.messages[3]).toEqual({
      role: "tool",
      tool_call_id: "call_1",
      content: "bridge docs",
    });
  });

  it("coerces malformed tool-call arguments to an empty object", async () => {
    create.mockResolvedValueOnce(
      streamOf({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "c1",
                  type: "function",
                  function: { name: "write_game_code", arguments: "not json" },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
    );

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

  it("emits narration + write-progress activity while streaming and forwards the signal", async () => {
    create.mockResolvedValueOnce(
      streamOf(
        { choices: [{ delta: { content: "Now " } }] },
        { choices: [{ delta: { content: "writing the game." } }] },
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  { index: 0, id: "c1", function: { name: "write_game_code", arguments: "" } },
                ],
              },
            },
          ],
        },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"code":' } }] } }] },
        {
          choices: [
            {
              delta: { tool_calls: [{ index: 0, function: { arguments: '"x"}' } }] },
              finish_reason: "tool_calls",
            },
          ],
        },
        { choices: [], usage: { prompt_tokens: 1, completion_tokens: 1 } },
      ),
    );

    const events: AgentActivityEvent[] = [];
    const controller = new AbortController();
    const driver = createGameDriver("xai", {
      apiKey: "k",
      model: "grok-4.3",
      systemPrompt: "s",
      maxTokens: 10,
      onActivity: (e) => events.push(e),
      signal: controller.signal,
    });
    driver.seed(undefined, "go");
    const turn = await driver.runTurn();

    expect(turn.toolCalls).toEqual([{ id: "c1", name: "write_game_code", input: { code: "x" } }]);
    expect(turn.hasText).toBe(true);
    expect(events).toEqual([
      { type: "narration_start" },
      { type: "narration_delta", text: "Now " },
      { type: "narration_delta", text: "writing the game." },
      { type: "tool_started", name: "write_game_code" },
      { type: "write_progress", chars: 8 },
      { type: "write_progress", chars: 12 },
    ]);
    expect(create.mock.calls[0][1]).toEqual({ signal: controller.signal });
  });
});

describe("createXaiTurnAccumulator", () => {
  it("only reports write progress for write_game_code arguments", () => {
    const events: AgentActivityEvent[] = [];
    const acc = createXaiTurnAccumulator((e) => events.push(e));
    acc.push({
      choices: [
        {
          delta: {
            tool_calls: [{ index: 0, id: "v1", function: { name: "validate_game", arguments: "" } }],
          },
        },
      ],
    } as never);
    acc.push({
      choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"a":1}' } }] } }],
    } as never);
    expect(events).toEqual([{ type: "tool_started", name: "validate_game" }]);
    expect(acc.finish().toolCalls).toEqual([
      { id: "v1", name: "validate_game", arguments: '{"a":1}' },
    ]);
  });
});

describe("createAnthropicActivityHandler", () => {
  const event = (e: unknown): Anthropic.MessageStreamEvent => e as Anthropic.MessageStreamEvent;

  it("maps text blocks to narration and write_game_code input deltas to progress", () => {
    const events: AgentActivityEvent[] = [];
    const handle = createAnthropicActivityHandler((e) => events.push(e));

    handle(event({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }));
    handle(event({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Reading the docs" } }));
    handle(event({ type: "content_block_stop", index: 0 }));
    handle(
      event({
        type: "content_block_start",
        index: 1,
        content_block: { type: "tool_use", id: "t1", name: "write_game_code", input: {} },
      }),
    );
    handle(event({ type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"code":"<html' } }));
    handle(event({ type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: ">..." } }));

    expect(events).toEqual([
      { type: "narration_start" },
      { type: "narration_delta", text: "Reading the docs" },
      { type: "tool_started", name: "write_game_code" },
      { type: "write_progress", chars: 14 },
      { type: "write_progress", chars: 18 },
    ]);
  });

  it("stays silent for other tools' input deltas", () => {
    const events: AgentActivityEvent[] = [];
    const handle = createAnthropicActivityHandler((e) => events.push(e));
    handle(
      event({
        type: "content_block_start",
        index: 0,
        content_block: { type: "tool_use", id: "t1", name: "validate_game", input: {} },
      }),
    );
    handle(event({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: "{}" } }));
    expect(events).toEqual([{ type: "tool_started", name: "validate_game" }]);
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
    create.mockResolvedValueOnce(
      streamOf({
        choices: [{ delta: { content: "ok" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
    );
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
    create.mockResolvedValueOnce(
      streamOf({
        choices: [{ delta: { content: "ok" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
    );

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

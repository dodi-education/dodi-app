/**
 * Provider drivers for the game-coding agent loop.
 *
 * `runGameAgent` (game-agent.ts) owns the provider-neutral loop — prompts, tool
 * execution, validation, step emission. A `GameCodeDriver` isolates the one
 * provider-specific concern: holding the running transcript in the provider's
 * own format and executing a single model turn (with tool calling) against it.
 *
 * Anthropic uses content-block messages + explicit prompt-cache breakpoints;
 * xAI (Grok) uses the OpenAI-compatible chat/completions shape (role:"tool"
 * results, automatic prompt caching). Both run client-side with the vault key.
 */

import Anthropic from "@anthropic-ai/sdk";
import type OpenAI from "openai";

import type { AgentActivityEvent } from "@dodi/types/agent-progress";
import type { AIProviderId } from "@dodi/types/ai";
import type { TokenUsage } from "@dodi/types/usage";

import { parseImageDataUrl } from "./data-url";
import { AGENT_TOOLS } from "./game-agent-tools";
import { anthropicUsage, xaiUsage } from "./usage-map";
import { createXaiClient } from "./xai";

/** A resumed display turn — restored from a persisted conversation transcript. */
export interface PriorTurn {
  role: "user" | "assistant";
  text: string;
  /** Attached images as data URLs (reference images on user turns). */
  images?: string[];
}

/** A user message with optional image attachments (data URLs). */
export interface UserContent {
  text: string;
  images?: string[];
}

function toUserContent(content: string | UserContent): UserContent {
  return typeof content === "string" ? { text: content } : content;
}

/** Attached data URLs that parse as provider-acceptable images. */
function validImages(images: string[] | undefined): string[] {
  return (images ?? []).filter((i) => parseImageDataUrl(i) !== null);
}

/** Provider-neutral tool call surfaced from a model turn. */
export interface GameToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/** Provider-neutral tool result to feed back into the transcript. */
export interface GameToolResult {
  id: string;
  content: string;
}

export interface GameTurn {
  toolCalls: GameToolCall[];
  /** The assistant produced text output (used to nudge toward tool use). */
  hasText: boolean;
  /** Model wants to continue after tool results (Anthropic stop_reason
   *  "tool_use" / OpenAI finish_reason "tool_calls"). */
  expectsToolResults: boolean;
  /** Raw provider stop/finish reason — surfaced in failure diagnostics so a
   *  "max_tokens" truncation is distinguishable from the model just stopping. */
  stopReason: string | null;
  usage: TokenUsage;
}

export interface GameCodeDriver {
  /** Initialize the transcript from any resumed turns + the concrete task. */
  seed(priorTurns: PriorTurn[] | undefined, firstUserMessage: string | UserContent): void;
  /** Append a user message (nudges, validation-fix requests, attachments). */
  addUserMessage(content: string | UserContent): void;
  /** Run one model turn; appends the assistant reply to the transcript. */
  runTurn(): Promise<GameTurn>;
  /** Append tool results for the calls returned by the last turn. */
  addToolResults(results: GameToolResult[]): void;
}

export interface GameDriverOptions {
  /** Vault-decrypted provider key. Never persisted or logged. */
  apiKey: string;
  model: string;
  systemPrompt: string;
  maxTokens: number;
  /** Toolset for this run (defaults to the base AGENT_TOOLS). */
  tools?: Anthropic.Tool[];
  /** Live activity sink — narration text deltas, tool starts, write progress. */
  onActivity?: (event: AgentActivityEvent) => void;
  /** Aborts the in-flight request mid-stream (Stop button). */
  signal?: AbortSignal;
}

function parseJsonObject(raw: string | undefined | null): Record<string, unknown> {
  if (!raw || !raw.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Anthropic driver
// ---------------------------------------------------------------------------

/** Content blocks for one turn — images first, then the text. Empty when blank. */
function toAnthropicBlocks(content: UserContent): Anthropic.ContentBlockParam[] {
  const blocks: Anthropic.ContentBlockParam[] = [];
  for (const image of validImages(content.images)) {
    const parsed = parseImageDataUrl(image)!;
    blocks.push({
      type: "image",
      source: { type: "base64", media_type: parsed.mediaType, data: parsed.base64 },
    });
  }
  const text = content.text.trim();
  if (text) blocks.push({ type: "text", text });
  return blocks;
}

/**
 * User content for a request message: plain string when text-only (keeps the
 * transcript readable in devtools), content blocks when images ride along.
 */
export function toAnthropicContent(
  content: string | UserContent,
): string | Anthropic.ContentBlockParam[] {
  const normalized = toUserContent(content);
  if (validImages(normalized.images).length === 0) return normalized.text;
  return toAnthropicBlocks(normalized);
}

/** Collapse consecutive same-role turns so the API always sees alternating roles. */
function toSeedMessages(turns: PriorTurn[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const turn of turns) {
    const blocks = toAnthropicBlocks({ text: turn.text, images: turn.images });
    if (blocks.length === 0) continue;
    const last = out[out.length - 1];
    if (last && last.role === turn.role) {
      const prev: Anthropic.ContentBlockParam[] =
        typeof last.content === "string"
          ? [{ type: "text", text: last.content }]
          : (last.content as Anthropic.ContentBlockParam[]);
      last.content = [...prev, ...blocks];
    } else {
      // Text-only turns stay plain strings (the common case); mixed turns are blocks.
      out.push({
        role: turn.role,
        content: blocks.length === 1 && blocks[0].type === "text" ? blocks[0].text : blocks,
      });
    }
  }
  return out;
}

/**
 * Return `messages` with a rolling prompt-cache breakpoint on the last block of
 * the final turn. Each turn re-sends the whole transcript as input; without
 * caching that context is re-billed at full price on every turn. The rolling
 * breakpoint (plus the static one on `system`) lets every turn re-read the prior
 * context at ~0.1x. The source array is left untouched — the marker is
 * request-only.
 */
function messagesWithRollingCache(
  messages: Anthropic.MessageParam[],
): Anthropic.MessageParam[] {
  if (messages.length === 0) return messages;
  const out = messages.slice();
  const last = out[out.length - 1];
  const blocks: Anthropic.ContentBlockParam[] =
    typeof last.content === "string"
      ? [{ type: "text", text: last.content }]
      : last.content.slice();
  const i = blocks.length - 1;
  blocks[i] = {
    ...blocks[i],
    cache_control: { type: "ephemeral" },
  } as Anthropic.ContentBlockParam;
  out[out.length - 1] = { ...last, content: blocks };
  return out;
}

/**
 * Per-turn translator from raw Anthropic stream events to AgentActivityEvents.
 * Stateful across one turn (tracks which block is currently streaming) —
 * create a fresh handler for every runTurn.
 */
export function createAnthropicActivityHandler(
  emit: (event: AgentActivityEvent) => void,
): (event: Anthropic.MessageStreamEvent) => void {
  let currentTool: string | null = null;
  let writeChars = 0;
  return (event) => {
    if (event.type === "content_block_start") {
      const block = event.content_block;
      if (block.type === "text") {
        currentTool = null;
        emit({ type: "narration_start" });
      } else if (block.type === "tool_use") {
        currentTool = block.name;
        if (block.name === "write_game_code") writeChars = 0;
        emit({ type: "tool_started", name: block.name });
      }
    } else if (event.type === "content_block_delta") {
      if (event.delta.type === "text_delta") {
        emit({ type: "narration_delta", text: event.delta.text });
      } else if (event.delta.type === "input_json_delta" && currentTool === "write_game_code") {
        writeChars += event.delta.partial_json.length;
        emit({ type: "write_progress", chars: writeChars });
      }
    }
  };
}

class AnthropicGameDriver implements GameCodeDriver {
  #client: Anthropic;
  #model: string;
  #maxTokens: number;
  #tools: Anthropic.Tool[];
  #system: Anthropic.TextBlockParam[];
  #messages: Anthropic.MessageParam[] = [];
  #onActivity?: (event: AgentActivityEvent) => void;
  #signal?: AbortSignal;

  constructor(opts: GameDriverOptions) {
    this.#client = new Anthropic({ apiKey: opts.apiKey, dangerouslyAllowBrowser: true });
    this.#model = opts.model;
    this.#maxTokens = opts.maxTokens;
    this.#tools = opts.tools ?? AGENT_TOOLS;
    this.#onActivity = opts.onActivity;
    this.#signal = opts.signal;
    // Cache the static prefix (tools render before system, so this one breakpoint
    // covers both). The rolling per-turn breakpoint is added at request time.
    this.#system = [
      { type: "text", text: opts.systemPrompt, cache_control: { type: "ephemeral" } },
    ];
  }

  seed(priorTurns: PriorTurn[] | undefined, firstUserMessage: string | UserContent): void {
    this.#messages = priorTurns?.length ? toSeedMessages(priorTurns) : [];
    this.#messages.push({ role: "user", content: toAnthropicContent(firstUserMessage) });
  }

  addUserMessage(content: string | UserContent): void {
    this.#messages.push({ role: "user", content: toAnthropicContent(content) });
  }

  async runTurn(): Promise<GameTurn> {
    // Stream the turn and collect the final message. With the output cap far
    // above ~16k tokens, a non-streaming request would sit silent for minutes
    // and blow the SDK's HTTP timeout budget; a streaming connection keeps
    // bytes flowing for the whole write.
    const stream = this.#client.messages.stream(
      {
        model: this.#model,
        max_tokens: this.#maxTokens,
        system: this.#system,
        tools: this.#tools,
        messages: messagesWithRollingCache(this.#messages),
      },
      { signal: this.#signal },
    );
    if (this.#onActivity) stream.on("streamEvent", createAnthropicActivityHandler(this.#onActivity));
    const response = await stream.finalMessage();

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    const textBlocks = response.content.filter(
      (b): b is Anthropic.TextBlock => b.type === "text",
    );

    this.#messages.push({ role: "assistant", content: response.content });

    return {
      toolCalls: toolUseBlocks.map((b) => ({
        id: b.id,
        name: b.name,
        input: (b.input ?? {}) as Record<string, unknown>,
      })),
      hasText: textBlocks.length > 0,
      expectsToolResults: response.stop_reason === "tool_use",
      stopReason: response.stop_reason,
      usage: anthropicUsage(response.usage),
    };
  }

  addToolResults(results: GameToolResult[]): void {
    this.#messages.push({
      role: "user",
      content: results.map((r) => ({
        type: "tool_result" as const,
        tool_use_id: r.id,
        content: r.content,
      })),
    });
  }
}

// ---------------------------------------------------------------------------
// xAI (Grok) driver — OpenAI-compatible chat/completions
// ---------------------------------------------------------------------------

/** Convert the Anthropic-format tool defs to OpenAI function tools. */
export function toOpenAITools(
  tools: Anthropic.Tool[],
): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema as Record<string, unknown>,
    },
  }));
}

/**
 * User content for an OpenAI-compatible request: plain string when text-only,
 * content parts (image_url takes the data URL directly) when images ride along.
 */
export function toXaiContent(
  content: string | UserContent,
): string | OpenAI.Chat.Completions.ChatCompletionContentPart[] {
  const normalized = toUserContent(content);
  const images = validImages(normalized.images);
  if (images.length === 0) return normalized.text;
  const parts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = images.map((url) => ({
    type: "image_url",
    image_url: { url },
  }));
  const text = normalized.text.trim();
  if (text) parts.push({ type: "text", text });
  return parts;
}

/** One turn's worth of accumulated streaming chunks in provider shape. */
interface XaiAccumulatedTurn {
  content: string;
  toolCalls: { id: string; name: string; arguments: string }[];
  finishReason: string | null;
  usage: OpenAI.Completions.CompletionUsage | undefined;
}

/**
 * Per-turn accumulator for OpenAI-compatible streaming chunks: reassembles the
 * assistant message (content + tool calls, usage from the final chunk) while
 * emitting AgentActivityEvents as deltas arrive. Create a fresh one per turn.
 */
export function createXaiTurnAccumulator(
  emit: (event: AgentActivityEvent) => void = () => {},
): {
  push: (chunk: OpenAI.Chat.Completions.ChatCompletionChunk) => void;
  finish: () => XaiAccumulatedTurn;
} {
  let content = "";
  let hasNarration = false;
  let finishReason: string | null = null;
  let usage: OpenAI.Completions.CompletionUsage | undefined;
  // Sparse by delta index — a provider may interleave several calls per turn.
  const calls: { id: string; name: string; arguments: string }[] = [];

  return {
    push(chunk) {
      if (chunk.usage) usage = chunk.usage;
      const choice = chunk.choices?.[0];
      if (!choice) return;
      if (choice.finish_reason) finishReason = choice.finish_reason;
      const delta = choice.delta;
      if (!delta) return;
      if (typeof delta.content === "string" && delta.content.length > 0) {
        if (!hasNarration) {
          hasNarration = true;
          emit({ type: "narration_start" });
        }
        content += delta.content;
        emit({ type: "narration_delta", text: delta.content });
      }
      for (const tc of delta.tool_calls ?? []) {
        let call = calls[tc.index];
        if (!call) {
          call = { id: "", name: "", arguments: "" };
          calls[tc.index] = call;
        }
        if (tc.id) call.id = tc.id;
        if (tc.function?.name) {
          call.name = tc.function.name;
          emit({ type: "tool_started", name: call.name });
        }
        if (tc.function?.arguments) {
          call.arguments += tc.function.arguments;
          if (call.name === "write_game_code") {
            emit({ type: "write_progress", chars: call.arguments.length });
          }
        }
      }
    },
    finish: () => ({ content, toolCalls: calls.filter(Boolean), finishReason, usage }),
  };
}

class XaiGameDriver implements GameCodeDriver {
  #client: OpenAI;
  #model: string;
  #maxTokens: number;
  #systemPrompt: string;
  #tools: OpenAI.Chat.Completions.ChatCompletionTool[];
  #messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
  #onActivity?: (event: AgentActivityEvent) => void;
  #signal?: AbortSignal;

  constructor(opts: GameDriverOptions) {
    this.#client = createXaiClient(opts.apiKey, true);
    this.#model = opts.model;
    this.#maxTokens = opts.maxTokens;
    this.#systemPrompt = opts.systemPrompt;
    this.#tools = toOpenAITools(opts.tools ?? AGENT_TOOLS);
    this.#onActivity = opts.onActivity;
    this.#signal = opts.signal;
  }

  seed(priorTurns: PriorTurn[] | undefined, firstUserMessage: string | UserContent): void {
    this.#messages = [{ role: "system", content: this.#systemPrompt }];
    for (const turn of priorTurns ?? []) {
      const text = turn.text.trim();
      // Assistant turns are text-only in the OpenAI shape; user turns may carry images.
      if (turn.role === "user" && validImages(turn.images).length > 0) {
        this.#messages.push({ role: "user", content: toXaiContent({ text, images: turn.images }) });
      } else if (text) {
        this.#messages.push({ role: turn.role, content: text });
      }
    }
    this.#messages.push({ role: "user", content: toXaiContent(firstUserMessage) });
  }

  addUserMessage(content: string | UserContent): void {
    this.#messages.push({ role: "user", content: toXaiContent(content) });
  }

  async runTurn(): Promise<GameTurn> {
    // Stream the turn: keeps long code writes from sitting silent against HTTP
    // timeouts, feeds the live activity line, and lets Stop abort mid-write.
    const stream = await this.#client.chat.completions.create(
      {
        model: this.#model,
        max_tokens: this.#maxTokens,
        // Snapshot: we append the assistant reply to #messages right after, so the
        // request must not alias the live array.
        messages: [...this.#messages],
        tools: this.#tools,
        tool_choice: "auto",
        stream: true,
        // Usage arrives on the stream's final chunk instead of a response envelope.
        stream_options: { include_usage: true },
      },
      { signal: this.#signal },
    );

    const acc = createXaiTurnAccumulator(this.#onActivity);
    for await (const chunk of stream) acc.push(chunk);
    const turn = acc.finish();

    const rawToolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] =
      turn.toolCalls.map((c) => ({
        id: c.id,
        type: "function",
        function: { name: c.name, arguments: c.arguments },
      }));

    // Append the assistant message (with its tool_calls) so the tool results we
    // add next attach to it — OpenAI requires each tool_call to be answered.
    this.#messages.push({
      role: "assistant",
      content: turn.content,
      ...(rawToolCalls.length > 0 ? { tool_calls: rawToolCalls } : {}),
    });

    return {
      toolCalls: turn.toolCalls.map((c) => ({
        id: c.id,
        name: c.name,
        input: parseJsonObject(c.arguments),
      })),
      hasText: turn.content.trim().length > 0,
      expectsToolResults: turn.finishReason === "tool_calls",
      stopReason: turn.finishReason,
      usage: xaiUsage(turn.usage),
    };
  }

  addToolResults(results: GameToolResult[]): void {
    for (const r of results) {
      this.#messages.push({ role: "tool", tool_call_id: r.id, content: r.content });
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createGameDriver(
  provider: AIProviderId,
  opts: GameDriverOptions,
): GameCodeDriver {
  switch (provider) {
    case "anthropic":
      return new AnthropicGameDriver(opts);
    case "xai":
      return new XaiGameDriver(opts);
    default:
      throw new Error(`Provider "${provider}" does not support game generation`);
  }
}

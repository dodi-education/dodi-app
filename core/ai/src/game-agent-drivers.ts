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

import type { AIProviderId } from "@dodi/types/ai";
import type { TokenUsage } from "@dodi/types/usage";

import { AGENT_TOOLS } from "./game-agent-tools";
import { anthropicUsage, xaiUsage } from "./usage-map";
import { createXaiClient } from "./xai";

/** A resumed display turn — restored from a persisted conversation transcript. */
export interface PriorTurn {
  role: "user" | "assistant";
  text: string;
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
  seed(priorTurns: PriorTurn[] | undefined, firstUserMessage: string): void;
  /** Append a plain user message (nudges, validation-fix requests). */
  addUserMessage(text: string): void;
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

/** Collapse consecutive same-role turns so the API always sees alternating roles. */
function toSeedMessages(turns: PriorTurn[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const turn of turns) {
    const text = turn.text.trim();
    if (!text) continue;
    const last = out[out.length - 1];
    if (last && last.role === turn.role) {
      last.content = `${last.content as string}\n\n${text}`;
    } else {
      out.push({ role: turn.role, content: text });
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

class AnthropicGameDriver implements GameCodeDriver {
  #client: Anthropic;
  #model: string;
  #maxTokens: number;
  #system: Anthropic.TextBlockParam[];
  #messages: Anthropic.MessageParam[] = [];

  constructor(opts: GameDriverOptions) {
    this.#client = new Anthropic({ apiKey: opts.apiKey, dangerouslyAllowBrowser: true });
    this.#model = opts.model;
    this.#maxTokens = opts.maxTokens;
    // Cache the static prefix (tools render before system, so this one breakpoint
    // covers both). The rolling per-turn breakpoint is added at request time.
    this.#system = [
      { type: "text", text: opts.systemPrompt, cache_control: { type: "ephemeral" } },
    ];
  }

  seed(priorTurns: PriorTurn[] | undefined, firstUserMessage: string): void {
    this.#messages = priorTurns?.length ? toSeedMessages(priorTurns) : [];
    this.#messages.push({ role: "user", content: firstUserMessage });
  }

  addUserMessage(text: string): void {
    this.#messages.push({ role: "user", content: text });
  }

  async runTurn(): Promise<GameTurn> {
    // Stream the turn and collect the final message. With the output cap far
    // above ~16k tokens, a non-streaming request would sit silent for minutes
    // and blow the SDK's HTTP timeout budget; a streaming connection keeps
    // bytes flowing for the whole write.
    const stream = this.#client.messages.stream({
      model: this.#model,
      max_tokens: this.#maxTokens,
      system: this.#system,
      tools: AGENT_TOOLS,
      messages: messagesWithRollingCache(this.#messages),
    });
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

class XaiGameDriver implements GameCodeDriver {
  #client: OpenAI;
  #model: string;
  #maxTokens: number;
  #systemPrompt: string;
  #tools: OpenAI.Chat.Completions.ChatCompletionTool[];
  #messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

  constructor(opts: GameDriverOptions) {
    this.#client = createXaiClient(opts.apiKey, true);
    this.#model = opts.model;
    this.#maxTokens = opts.maxTokens;
    this.#systemPrompt = opts.systemPrompt;
    this.#tools = toOpenAITools(AGENT_TOOLS);
  }

  seed(priorTurns: PriorTurn[] | undefined, firstUserMessage: string): void {
    this.#messages = [{ role: "system", content: this.#systemPrompt }];
    for (const turn of priorTurns ?? []) {
      const text = turn.text.trim();
      if (text) this.#messages.push({ role: turn.role, content: text });
    }
    this.#messages.push({ role: "user", content: firstUserMessage });
  }

  addUserMessage(text: string): void {
    this.#messages.push({ role: "user", content: text });
  }

  async runTurn(): Promise<GameTurn> {
    const res = await this.#client.chat.completions.create({
      model: this.#model,
      max_tokens: this.#maxTokens,
      // Snapshot: we append the assistant reply to #messages right after, so the
      // request must not alias the live array.
      messages: [...this.#messages],
      tools: this.#tools,
      tool_choice: "auto",
    });

    const choice = res.choices[0];
    const msg = choice?.message;
    const rawToolCalls = msg?.tool_calls ?? [];
    const functionCalls = rawToolCalls.filter((tc) => tc.type === "function");

    // Append the assistant message (with its tool_calls) so the tool results we
    // add next attach to it — OpenAI requires each tool_call to be answered.
    this.#messages.push({
      role: "assistant",
      content: msg?.content ?? "",
      ...(rawToolCalls.length > 0 ? { tool_calls: rawToolCalls } : {}),
    });

    return {
      toolCalls: functionCalls.map((tc) => {
        const fn = (tc as { function: { name: string; arguments: string } }).function;
        return { id: tc.id, name: fn.name, input: parseJsonObject(fn.arguments) };
      }),
      hasText: typeof msg?.content === "string" && msg.content.trim().length > 0,
      expectsToolResults: choice?.finish_reason === "tool_calls",
      stopReason: choice?.finish_reason ?? null,
      usage: xaiUsage(res.usage),
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

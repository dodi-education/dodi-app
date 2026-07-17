import { describe, expect, it, vi } from "vitest";

import type { GameCodeDriver, GameTurn } from "./game-agent-drivers";
import { AGENT_LIMITS, GameAgentError, runGameAgent } from "./game-agent";
import type { AgentTaskRequest } from "@dodi/types/tasks";

vi.mock("./game-agent-drivers", async (importOriginal) => {
  const original = await importOriginal<typeof import("./game-agent-drivers")>();
  return { ...original, createGameDriver: (...args: unknown[]) => mockDriverFactory(...args) };
});

let mockDriverFactory: (...args: unknown[]) => GameCodeDriver;

function driverReturning(turns: GameTurn[]): GameCodeDriver {
  let i = 0;
  return {
    seed: () => {},
    addUserMessage: () => {},
    addToolResults: () => {},
    runTurn: () => Promise.resolve(turns[Math.min(i++, turns.length - 1)]),
  };
}

const TASK: AgentTaskRequest = {
  kidId: "kid-1",
  taskType: "generate_game",
  childContext: { name: "Kid", language: "English" },
  payload: { prompt: "a game" },
};

const emptyUsage = { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 };

describe("AGENT_LIMITS", () => {
  it("bounds output tokens and retries to the priced worst-case", () => {
    // These values back the pricing model's per-game worst-case ceiling; a
    // regression here silently widens cost risk, so pin them exactly.
    // MAX_TOKENS was deliberately raised 8k → 100k on 2026-07-17 (prod builds
    // truncated at 8k) — headroom, not expected spend; real writes stay ~10-15k.
    expect(AGENT_LIMITS).toEqual({
      MAX_AGENT_TURNS: 15,
      MAX_VALIDATION_RETRIES: 1,
      MAX_TOKENS: 100_000,
    });
  });
});

describe("per-model output-cap clamping", () => {
  // The driver must never be asked for more output tokens than its model
  // accepts — Anthropic 400s on max_tokens above the model maximum.
  async function driverMaxTokens(provider: "anthropic" | "xai", model: string): Promise<number> {
    let captured: number | undefined;
    mockDriverFactory = (...args: unknown[]) => {
      captured = (args[1] as { maxTokens: number }).maxTokens;
      return driverReturning([
        {
          toolCalls: [],
          hasText: false,
          expectsToolResults: false,
          stopReason: "end_turn",
          usage: emptyUsage,
        },
      ]);
    };
    // The run fails (no code written) — only the captured driver opts matter.
    await runGameAgent({ provider, apiKey: "k", model, task: TASK }).catch(() => {});
    return captured!;
  }

  it("passes the full ceiling to models whose cap exceeds it", async () => {
    expect(await driverMaxTokens("anthropic", "claude-opus-4-8")).toBe(100_000);
  });

  it("clamps to the model's registered output cap", async () => {
    expect(await driverMaxTokens("anthropic", "claude-sonnet-4-6")).toBe(64_000);
  });

  it("falls back to the conservative cap for unregistered models", async () => {
    expect(await driverMaxTokens("xai", "grok-4.3")).toBe(64_000);
  });
});

describe("runGameAgent failure diagnostics", () => {
  it("throws GameAgentError with turn/stop-reason diagnostics when no code was written", async () => {
    // A truncated write: the model stops at max_tokens with its tool call cut
    // off, so no usable write_game_code ever lands.
    mockDriverFactory = () =>
      driverReturning([
        {
          toolCalls: [],
          hasText: true,
          expectsToolResults: false,
          stopReason: "max_tokens",
          usage: emptyUsage,
        },
        {
          toolCalls: [],
          hasText: false,
          expectsToolResults: false,
          stopReason: "max_tokens",
          usage: emptyUsage,
        },
      ]);

    const run = runGameAgent({
      provider: "anthropic",
      apiKey: "test-key",
      model: "test-model",
      task: TASK,
    });

    await expect(run).rejects.toBeInstanceOf(GameAgentError);
    await run.catch((err: GameAgentError) => {
      expect(err.diagnostics).toEqual({
        turns: 2,
        lastStopReason: "max_tokens",
        sawToolCalls: false,
        sawText: true,
      });
    });
  });
});

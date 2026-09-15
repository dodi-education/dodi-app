import { describe, expect, it, vi } from "vitest";

import type {
  GameCodeDriver,
  GameDriverOptions,
  GameToolResult,
  GameTurn,
  PriorTurn,
  UserContent,
} from "./game-agent-drivers";
import { AgentAbortedError } from "./game-agent";
import { PLAN_LIMITS, PROPOSE_PLAN_TOOL, runPlanAgent } from "./game-plan-agent";

vi.mock("./game-agent-drivers", async (importOriginal) => {
  const original = await importOriginal<typeof import("./game-agent-drivers")>();
  return { ...original, createGameDriver: (...args: unknown[]) => mockDriverFactory(...args) };
});

let mockDriverFactory: (...args: unknown[]) => GameCodeDriver;

const emptyUsage = { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 };

/** A turn the model produced: some text, some tool calls, or both. */
function turn(overrides: Partial<GameTurn> = {}): GameTurn {
  const toolCalls = overrides.toolCalls ?? [];
  return {
    toolCalls,
    text: "",
    hasText: Boolean(overrides.text?.trim()),
    expectsToolResults: toolCalls.length > 0,
    stopReason: toolCalls.length > 0 ? "tool_use" : "end_turn",
    usage: emptyUsage,
    ...overrides,
  };
}

function proposeCall(summary: unknown, id = "p1") {
  return { id, name: "propose_plan", input: { summary } as Record<string, unknown> };
}

/** Driver double that records everything the agent hands it. */
function recordingDriver(turns: GameTurn[]) {
  const seeded: { priorTurns?: PriorTurn[]; first?: string | UserContent } = {};
  const toolResults: GameToolResult[][] = [];
  let i = 0;
  const driver: GameCodeDriver = {
    seed: (priorTurns, first) => {
      seeded.priorTurns = priorTurns;
      seeded.first = first;
    },
    addUserMessage: () => {},
    addToolResults: (results) => {
      toolResults.push(results);
    },
    runTurn: () => Promise.resolve(turns[Math.min(i++, turns.length - 1)]),
  };
  return { driver, seeded, toolResults, calls: () => i };
}

const BASE = {
  provider: "anthropic" as const,
  apiKey: "k",
  model: "claude-opus-4-8",
  childContext: { age: 7, language: "German" },
  replyLanguage: "English",
};

describe("runPlanAgent", () => {
  it("returns the model's text when it only talks", async () => {
    const rec = recordingDriver([turn({ text: "What should your child practise?" })]);
    mockDriverFactory = () => rec.driver;

    const result = await runPlanAgent({ ...BASE, message: { text: "a math game" } });

    expect(result.reply).toBe("What should your child practise?");
    expect(result.plan).toBeNull();
    expect(result.turns).toBe(1);
    expect(rec.toolResults).toEqual([]);
  });

  it("captures a proposed plan and answers the tool call", async () => {
    const rec = recordingDriver([
      turn({ text: "Here is an idea.", toolCalls: [proposeCall("**Goal**\n- count to ten")] }),
    ]);
    mockDriverFactory = () => rec.driver;

    const result = await runPlanAgent({ ...BASE, message: { text: "a counting game" } });

    expect(result.plan).toEqual({ summary: "**Goal**\n- count to ten" });
    expect(result.reply).toBe("Here is an idea.");
    // One reply plus one proposal is a complete exchange — no extra round-trip.
    expect(result.turns).toBe(1);
    expect(rec.toolResults[0][0].id).toBe("p1");
    expect(rec.toolResults[0][0].content).toContain("Plan shown to the parent");
  });

  it("runs a second turn when the model proposes without saying anything", async () => {
    const rec = recordingDriver([
      turn({ toolCalls: [proposeCall("**Goal**\n- sort shapes")] }),
      turn({ text: "I made it about shapes." }),
    ]);
    mockDriverFactory = () => rec.driver;

    const result = await runPlanAgent({ ...BASE, message: { text: "something with shapes" } });

    expect(result.plan).toEqual({ summary: "**Goal**\n- sort shapes" });
    expect(result.reply).toBe("I made it about shapes.");
    expect(result.turns).toBe(2);
  });

  it("keeps the newest proposal when the model proposes twice", async () => {
    const rec = recordingDriver([
      turn({ toolCalls: [proposeCall("first", "p1"), proposeCall("second", "p2")] }),
      turn({ text: "done" }),
    ]);
    mockDriverFactory = () => rec.driver;

    const result = await runPlanAgent({ ...BASE, message: { text: "go" } });

    expect(result.plan).toEqual({ summary: "second" });
    expect(rec.toolResults[0].map((r) => r.id)).toEqual(["p1", "p2"]);
  });

  it("ignores a malformed proposal instead of showing an empty plan", async () => {
    const rec = recordingDriver([
      turn({ text: "hmm", toolCalls: [proposeCall(undefined)] }),
      turn({ text: "hmm" }),
    ]);
    mockDriverFactory = () => rec.driver;

    const result = await runPlanAgent({ ...BASE, message: { text: "go" } });

    expect(result.plan).toBeNull();
  });

  it("answers an unknown tool call rather than hanging the exchange", async () => {
    const rec = recordingDriver([
      turn({ toolCalls: [{ id: "x1", name: "write_game_code", input: {} }] }),
      turn({ text: "sorry, planning only" }),
    ]);
    mockDriverFactory = () => rec.driver;

    const result = await runPlanAgent({ ...BASE, message: { text: "build it now" } });

    expect(rec.toolResults[0][0].content).toContain("Unknown tool");
    expect(result.plan).toBeNull();
    expect(result.reply).toBe("sorry, planning only");
  });

  it("seeds the prior thread and this turn's attachment", async () => {
    const IMG = "data:image/png;base64,AAAA";
    const prior: PriorTurn[] = [
      { role: "user", text: "hello" },
      { role: "assistant", text: "hi" },
    ];
    const rec = recordingDriver([turn({ text: "I see a worksheet." })]);
    mockDriverFactory = () => rec.driver;

    await runPlanAgent({
      ...BASE,
      priorTurns: prior,
      message: { text: "analyze this", images: [IMG] },
    });

    expect(rec.seeded.priorTurns).toEqual(prior);
    expect(rec.seeded.first).toEqual({ text: "analyze this", images: [IMG] });
  });

  it("offers only propose_plan and bounds its output", async () => {
    let opts: GameDriverOptions | undefined;
    const rec = recordingDriver([turn({ text: "ok" })]);
    mockDriverFactory = (...args: unknown[]) => {
      opts = args[1] as GameDriverOptions;
      return rec.driver;
    };

    await runPlanAgent({ ...BASE, message: { text: "go" }, currentPlan: "**Goal**\n- old plan" });

    expect(opts?.tools).toEqual([PROPOSE_PLAN_TOOL]);
    expect(opts?.maxTokens).toBe(PLAN_LIMITS.MAX_TOKENS);
    // The prompt carries the parent's language and the plan under discussion.
    expect(opts?.systemPrompt).toContain("English");
    expect(opts?.systemPrompt).toContain("old plan");
  });

  it("sums usage across turns", async () => {
    const usage = { inputTokens: 10, outputTokens: 5, cacheWriteTokens: 1, cacheReadTokens: 2 };
    const rec = recordingDriver([
      turn({ toolCalls: [proposeCall("plan")], usage }),
      turn({ text: "there you go", usage }),
    ]);
    mockDriverFactory = () => rec.driver;

    const result = await runPlanAgent({ ...BASE, message: { text: "go" } });

    expect(result.usage).toEqual({
      inputTokens: 20,
      outputTokens: 10,
      cacheWriteTokens: 2,
      cacheReadTokens: 4,
    });
  });

  it("stops at the turn cap", async () => {
    // A model that proposes forever without ever saying anything.
    const rec = recordingDriver([turn({ toolCalls: [proposeCall("plan")] })]);
    mockDriverFactory = () => rec.driver;

    const result = await runPlanAgent({ ...BASE, message: { text: "go" } });

    expect(result.turns).toBe(PLAN_LIMITS.MAX_TURNS);
  });

  it("reports Stop as an abort, not a failure", async () => {
    const controller = new AbortController();
    const rec = recordingDriver([turn({ text: "ok" })]);
    mockDriverFactory = () => ({
      ...rec.driver,
      runTurn: () => {
        controller.abort();
        return Promise.reject(new Error("The operation was aborted"));
      },
    });

    await expect(
      runPlanAgent({ ...BASE, message: { text: "go" }, signal: controller.signal }),
    ).rejects.toBeInstanceOf(AgentAbortedError);
  });
});

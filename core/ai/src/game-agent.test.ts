import { describe, expect, it, vi } from "vitest";

import type {
  GameCodeDriver,
  GameToolResult,
  GameTurn,
  PriorTurn,
  UserContent,
} from "./game-agent-drivers";
import { AGENT_LIMITS, GameAgentError, MAX_IMAGE_TURNS, runGameAgent } from "./game-agent";
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

describe("prior-turn image window", () => {
  const IMG = "data:image/png;base64,AAAA";

  async function seededTurns(priorTurns: PriorTurn[]): Promise<PriorTurn[] | undefined> {
    let captured: PriorTurn[] | undefined;
    mockDriverFactory = () => {
      const driver = driverReturning([
        {
          toolCalls: [],
          hasText: false,
          expectsToolResults: false,
          stopReason: "end_turn",
          usage: emptyUsage,
        },
      ]);
      return {
        ...driver,
        seed: (turns: PriorTurn[] | undefined, _first: string | UserContent) => {
          captured = turns;
        },
      };
    };
    await runGameAgent({
      provider: "anthropic",
      apiKey: "k",
      model: "m",
      task: TASK,
      priorTurns,
    }).catch(() => {});
    return captured;
  }

  it("keeps images only on the most recent MAX_IMAGE_TURNS user turns", async () => {
    const turns: PriorTurn[] = [
      { role: "user", text: "one", images: [IMG] },
      { role: "assistant", text: "a" },
      { role: "user", text: "two", images: [IMG] },
      { role: "assistant", text: "b" },
      { role: "user", text: "three", images: [IMG] },
    ];
    const seeded = await seededTurns(turns);
    expect(MAX_IMAGE_TURNS).toBe(2);
    expect(seeded).toEqual([
      { role: "user", text: "one\n[image attached]" },
      { role: "assistant", text: "a" },
      { role: "user", text: "two", images: [IMG] },
      { role: "assistant", text: "b" },
      { role: "user", text: "three", images: [IMG] },
    ]);
  });

  it("leaves image-free histories untouched", async () => {
    const turns: PriorTurn[] = [
      { role: "user", text: "one" },
      { role: "assistant", text: "a" },
    ];
    expect(await seededTurns(turns)).toEqual(turns);
  });
});

describe("task attachments", () => {
  const IMG = "data:image/png;base64,AAAA";

  it("payload images ride the seeded task message", async () => {
    let captured: string | UserContent | undefined;
    mockDriverFactory = () => {
      const driver = driverReturning([
        {
          toolCalls: [],
          hasText: false,
          expectsToolResults: false,
          stopReason: "end_turn",
          usage: emptyUsage,
        },
      ]);
      return {
        ...driver,
        seed: (_turns: PriorTurn[] | undefined, first: string | UserContent) => {
          captured = first;
        },
      };
    };
    await runGameAgent({
      provider: "anthropic",
      apiKey: "k",
      model: "m",
      task: { ...TASK, payload: { prompt: "a game", images: [IMG] } },
    }).catch(() => {});

    expect(captured).toBeTypeOf("object");
    const content = captured as UserContent;
    expect(content.images).toEqual([IMG]);
    expect(content.text).toContain("1 reference image(s) are attached");
  });

  it("update tasks put the screenshot first, before reference images", async () => {
    const SHOT = "data:image/jpeg;base64,SHOT";
    let captured: string | UserContent | undefined;
    mockDriverFactory = () => {
      const driver = driverReturning([
        {
          toolCalls: [],
          hasText: false,
          expectsToolResults: false,
          stopReason: "end_turn",
          usage: emptyUsage,
        },
      ]);
      return {
        ...driver,
        seed: (_turns: PriorTurn[] | undefined, first: string | UserContent) => {
          captured = first;
        },
      };
    };
    await runGameAgent({
      provider: "anthropic",
      apiKey: "k",
      model: "m",
      task: {
        ...TASK,
        taskType: "update_game",
        payload: {
          instruction: "bigger font",
          existingCode: "<html></html>",
          screenshot: SHOT,
          images: [IMG],
        },
      },
    }).catch(() => {});

    const content = captured as UserContent;
    expect(content.images).toEqual([SHOT, IMG]);
    expect(content.text).toContain("FIRST attached image is a screenshot");
    expect(content.text).toContain("reference image(s) are attached after the screenshot");
  });
});

describe("parent-owned title", () => {
  const writeTurn = (title: string): GameTurn => ({
    toolCalls: [
      {
        id: "w1",
        name: "write_game_code",
        input: { code: "<html><script>x=1</script></html>", markdown: "m", title, capabilities: [] },
      },
    ],
    hasText: false,
    expectsToolResults: true,
    stopReason: "tool_use",
    usage: emptyUsage,
  });
  const endTurn: GameTurn = {
    toolCalls: [],
    hasText: false,
    expectsToolResults: false,
    stopReason: "end_turn",
    usage: emptyUsage,
  };

  it("update tasks keep the game's existing title even when the model writes a new one", async () => {
    mockDriverFactory = () => driverReturning([writeTurn("Model Renamed It"), endTurn]);
    const result = await runGameAgent({
      provider: "anthropic",
      apiKey: "k",
      model: "m",
      task: {
        ...TASK,
        taskType: "update_game",
        payload: {
          instruction: "bigger font",
          existingCode: "<html></html>",
          title: "Buchstabensuppe",
        },
      },
    });
    expect(result.title).toBe("Buchstabensuppe");
  });

  it("generate tasks keep a parent-set title", async () => {
    mockDriverFactory = () => driverReturning([writeTurn("Model Title"), endTurn]);
    const result = await runGameAgent({
      provider: "anthropic",
      apiKey: "k",
      model: "m",
      task: { ...TASK, payload: { prompt: "a game", title: "Apple Orchard" } },
    });
    expect(result.title).toBe("Apple Orchard");
  });

  it("falls back to the model's title when no title exists", async () => {
    mockDriverFactory = () => driverReturning([writeTurn("Model Title"), endTurn]);
    const result = await runGameAgent({
      provider: "anthropic",
      apiKey: "k",
      model: "m",
      task: { ...TASK, payload: { prompt: "a game" } },
    });
    expect(result.title).toBe("Model Title");
  });
});

describe("background image loop integration", () => {
  const BG = "data:image/jpeg;base64,QkFDS0dST1VORA==";
  const PLACEHOLDER_BLOCK = `<style id="background-image">:root{--background-image:url("{{BACKGROUND_IMAGE}}")}</style>`;
  const compliant = (extra: string): string =>
    `<!doctype html><html><body>${extra}<script>
      window.addEventListener('message', function (e) {
        if (e.data.type === 'dodi:init') parent.postMessage({ type: 'game:ready', payload: { capabilities: [] } }, '*');
        if (e.data.type === 'dodi:command') parent.postMessage({ type: 'game:result' }, '*');
      });
    </script></body></html>`;

  const turn = (toolCalls: GameTurn["toolCalls"]): GameTurn => ({
    toolCalls,
    hasText: false,
    expectsToolResults: toolCalls.length > 0,
    stopReason: toolCalls.length > 0 ? "tool_use" : "end_turn",
    usage: emptyUsage,
  });

  function capturingDriver(turns: GameTurn[]) {
    const toolResults: GameToolResult[][] = [];
    let seedText = "";
    let i = 0;
    const driver: GameCodeDriver = {
      seed: (_t, first) => {
        seedText = typeof first === "string" ? first : first.text;
      },
      addUserMessage: () => {},
      addToolResults: (rs) => {
        toolResults.push(rs);
      },
      runTurn: () => Promise.resolve(turns[Math.min(i++, turns.length - 1)]),
    };
    return { driver, toolResults, getSeedText: () => seedText };
  }

  it("generates via the injected callback; base64 never enters the transcript", async () => {
    const code = compliant(PLACEHOLDER_BLOCK);
    const captured = capturingDriver([
      turn([{ id: "t1", name: "generate_background_image", input: { scene: "a sunny meadow" } }]),
      turn([
        {
          id: "t2",
          name: "write_game_code",
          input: { code, markdown: "m", title: "T", capabilities: [] },
        },
      ]),
      turn([]),
    ]);
    mockDriverFactory = () => captured.driver;

    const generate = vi.fn().mockResolvedValue(BG);
    const result = await runGameAgent({
      provider: "anthropic",
      apiKey: "k",
      model: "m",
      task: TASK,
      onGenerateBackgroundImage: generate,
    });

    expect(generate).toHaveBeenCalledWith("a sunny meadow");
    // Tool result carries the placeholder contract, never the image bytes.
    const bgResult = captured.toolResults[0][0];
    expect(bgResult.content).toContain("{{BACKGROUND_IMAGE}}");
    expect(bgResult.content).not.toContain("data:image");
    // The bundle stays in placeholder form; the image rides the side channel.
    expect(result.codeBundle).toContain("{{BACKGROUND_IMAGE}}");
    expect(result.backgroundImage).toBe(BG);
    expect(result.validationPassed).toBe(true);
  });

  it("update tasks reverse-swap the existing background out of the model's view", async () => {
    const placeholderCode = compliant(PLACEHOLDER_BLOCK);
    const inlinedCode = placeholderCode.replace("{{BACKGROUND_IMAGE}}", BG);
    const captured = capturingDriver([
      turn([{ id: "r1", name: "read_existing_game", input: {} }]),
      turn([
        {
          id: "w1",
          name: "write_game_code",
          input: { code: placeholderCode, markdown: "m", title: "T", capabilities: [] },
        },
      ]),
      turn([]),
    ]);
    mockDriverFactory = () => captured.driver;

    const result = await runGameAgent({
      provider: "anthropic",
      apiKey: "k",
      model: "m",
      task: {
        ...TASK,
        taskType: "update_game",
        payload: { instruction: "tweak it", existingCode: inlinedCode },
      },
    });

    // read_existing_game must show placeholder form, never the base64.
    const readResult = captured.toolResults[0][0];
    expect(readResult.content).toContain("{{BACKGROUND_IMAGE}}");
    expect(readResult.content).not.toContain(BG);
    // The carried image survives while still referenced.
    expect(result.backgroundImage).toBe(BG);
    expect(result.codeBundle).toContain("{{BACKGROUND_IMAGE}}");
    // The task message tells the model the background exists.
    expect(captured.getSeedText()).toContain("existing game has a generated background image");
  });

  it("nudges the model to call the tool when enabled (and only then)", async () => {
    const writeTurn = turn([
      {
        id: "w1",
        name: "write_game_code",
        input: { code: compliant(""), markdown: "m", title: "T", capabilities: [] },
      },
    ]);

    const enabled = capturingDriver([writeTurn, turn([])]);
    mockDriverFactory = () => enabled.driver;
    await runGameAgent({
      provider: "anthropic",
      apiKey: "k",
      model: "m",
      task: TASK,
      onGenerateBackgroundImage: vi.fn().mockResolvedValue(BG),
    });
    expect(enabled.getSeedText()).toContain("parent enabled AI background generation");
    expect(enabled.getSeedText()).not.toContain("use_uploaded_background");

    const disabled = capturingDriver([writeTurn, turn([])]);
    mockDriverFactory = () => disabled.driver;
    await runGameAgent({ provider: "anthropic", apiKey: "k", model: "m", task: TASK });
    expect(disabled.getSeedText()).not.toContain("parent enabled AI background generation");
  });

  it("with attachments, the nudge defers to the parent's uploaded-background choice", async () => {
    const writeTurn = turn([
      {
        id: "w1",
        name: "write_game_code",
        input: { code: compliant(""), markdown: "m", title: "T", capabilities: [] },
      },
    ]);
    const captured = capturingDriver([writeTurn, turn([])]);
    mockDriverFactory = () => captured.driver;
    await runGameAgent({
      provider: "anthropic",
      apiKey: "k",
      model: "m",
      task: { ...TASK, payload: { prompt: "a game", images: ["data:image/png;base64,AAAA"] } },
      onGenerateBackgroundImage: vi.fn().mockResolvedValue(BG),
    });
    const seed = captured.getSeedText();
    expect(seed).toContain("use_uploaded_background");
    expect(seed).toContain("the parent's instruction wins");
  });

  it("uses an uploaded reference image as the background via use_uploaded_background", async () => {
    const UPLOAD = "data:image/jpeg;base64,VVBMT0FE";
    const PREPARED = "data:image/jpeg;base64,U01BTEw=";
    let capturedTools: string[] | undefined;
    const captured = capturingDriver([
      turn([{ id: "t1", name: "use_uploaded_background", input: { imageIndex: 1 } }]),
      turn([
        {
          id: "w1",
          name: "write_game_code",
          input: { code: compliant(PLACEHOLDER_BLOCK), markdown: "m", title: "T", capabilities: [] },
        },
      ]),
      turn([]),
    ]);
    mockDriverFactory = (...args: unknown[]) => {
      capturedTools = (args[1] as { tools?: Array<{ name: string }> }).tools?.map((t) => t.name);
      return captured.driver;
    };

    const prepare = vi.fn().mockResolvedValue(PREPARED);
    const result = await runGameAgent({
      provider: "anthropic",
      apiKey: "k",
      model: "m",
      task: { ...TASK, payload: { prompt: "a game", images: [UPLOAD] } },
      onPrepareBackgroundImage: prepare,
    });

    // The tool is offered because the message carries reference images.
    expect(capturedTools).toContain("use_uploaded_background");
    expect(capturedTools).not.toContain("generate_background_image");
    expect(prepare).toHaveBeenCalledWith(UPLOAD);
    // Bounded upload rides the side channel; the transcript sees only the contract.
    expect(captured.toolResults[0][0].content).toContain("{{BACKGROUND_IMAGE}}");
    expect(captured.toolResults[0][0].content).not.toContain("VVBMT0FE");
    expect(result.backgroundImage).toBe(PREPARED);
    expect(result.codeBundle).toContain("{{BACKGROUND_IMAGE}}");
    expect(result.validationPassed).toBe(true);
  });

  it("does not offer use_uploaded_background without attachments", async () => {
    let capturedTools: string[] | undefined;
    mockDriverFactory = (...args: unknown[]) => {
      capturedTools = (args[1] as { tools?: Array<{ name: string }> }).tools?.map((t) => t.name);
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
    await runGameAgent({ provider: "anthropic", apiKey: "k", model: "m", task: TASK }).catch(
      () => {},
    );
    expect(capturedTools).not.toContain("use_uploaded_background");
  });

  it("propagates a generation failure so the studio can surface it", async () => {
    const captured = capturingDriver([
      turn([{ id: "t1", name: "generate_background_image", input: { scene: "a meadow" } }]),
      turn([
        {
          id: "w1",
          name: "write_game_code",
          input: { code: compliant(""), markdown: "m", title: "T", capabilities: [] },
        },
      ]),
      turn([]),
    ]);
    mockDriverFactory = () => captured.driver;

    const result = await runGameAgent({
      provider: "anthropic",
      apiKey: "k",
      model: "m",
      task: TASK,
      onGenerateBackgroundImage: vi.fn().mockRejectedValue(new Error("provider down")),
    });

    expect(result.backgroundImage).toBeUndefined();
    expect(result.backgroundImageFailed).toBe(true);
  });
});

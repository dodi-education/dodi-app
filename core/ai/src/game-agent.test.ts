import { describe, expect, it, vi } from "vitest";

import type {
  GameCodeDriver,
  GameDriverOptions,
  GameToolResult,
  GameTurn,
  PriorTurn,
  UserContent,
} from "./game-agent-drivers";
import { AGENT_LIMITS, AgentAbortedError, GameAgentError, MAX_IMAGE_TURNS, runGameAgent } from "./game-agent";
import type { AgentActivityEvent, AgentStep } from "@dodi/types/agent-progress";
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
    // MAX_VISUAL_FIX_ROUNDS (2026-09-22) adds at most two turns when a
    // screenshot service is on and the model skipped view_game: one to edit,
    // one to validate or retry.
    expect(AGENT_LIMITS).toEqual({
      MAX_AGENT_TURNS: 15,
      MAX_VALIDATION_RETRIES: 1,
      MAX_VISUAL_FIX_ROUNDS: 2,
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
          text: "",
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
          text: "narration",
          hasText: true,
          expectsToolResults: false,
          stopReason: "max_tokens",
          usage: emptyUsage,
        },
        {
          toolCalls: [],
          text: "",
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
          text: "",
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
          text: "",
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
          text: "",
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

  it("an agreed plan is framed as a spec, and its image as the intended game", async () => {
    // The studio's Plan step hands over a plan the parent already approved, so
    // the brief must not read like a free-form idea the model may reinterpret.
    let captured: string | UserContent | undefined;
    mockDriverFactory = () => {
      const driver = driverReturning([
        {
          toolCalls: [],
          text: "",
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
        payload: { prompt: "**Goal**\n- count apples", isAgreedPlan: true, images: [IMG] },
      },
    }).catch(() => {});

    const content = captured as UserContent;
    expect(content.text).toContain("reviewed and approved it");
    expect(content.text).toContain("do not add features it does not mention");
    expect(content.text).toContain("sketch or photo of the intended game");
    expect(content.text).not.toContain("Create a new game based on this description");
    expect(content.text).not.toContain("use them as visual guidance");
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
    text: "",
    hasText: false,
    expectsToolResults: true,
    stopReason: "tool_use",
    usage: emptyUsage,
  });
  const endTurn: GameTurn = {
    toolCalls: [],
    text: "",
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
    `<!doctype html><html><head><script type="application/dodi-translations">{"sourceLocale":"en","locales":{"en":{"game.title":"Game"}}}</script></head><body>${extra}<script>
      document.title = dodi.translate('game.title');
      window.addEventListener('message', function (e) {
        if (e.data.type === 'dodi:init') parent.postMessage({ type: 'game:ready', payload: { capabilities: [] } }, '*');
        if (e.data.type === 'dodi:command') parent.postMessage({ type: 'game:result' }, '*');
      });
    </script></body></html>`;

  const turn = (toolCalls: GameTurn["toolCalls"]): GameTurn => ({
    toolCalls,
    text: "",
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
          text: "",
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

describe("preview image loop integration", () => {
  const BG = "data:image/jpeg;base64,QkFDS0dST1VORA==";
  const PREVIEW = "data:image/jpeg;base64,UFJFVklFVw==";
  const PLACEHOLDER_BLOCK = `<style id="background-image">:root{--background-image:url("{{BACKGROUND_IMAGE}}")}</style>`;
  const compliant = (extra: string): string =>
    `<!doctype html><html><head><script type="application/dodi-translations">{"sourceLocale":"en","locales":{"en":{"game.title":"Game"}}}</script></head><body>${extra}<script>
      document.title = dodi.translate('game.title');
      window.addEventListener('message', function (e) {
        if (e.data.type === 'dodi:init') parent.postMessage({ type: 'game:ready', payload: { capabilities: [] } }, '*');
        if (e.data.type === 'dodi:command') parent.postMessage({ type: 'game:result' }, '*');
      });
    </script></body></html>`;

  const turn = (toolCalls: GameTurn["toolCalls"], hasText = false): GameTurn => ({
    toolCalls,
    text: hasText ? "narration" : "",
    hasText,
    expectsToolResults: toolCalls.length > 0,
    stopReason: toolCalls.length > 0 ? "tool_use" : "end_turn",
    usage: emptyUsage,
  });

  function capturingDriver(turns: GameTurn[]) {
    const toolResults: GameToolResult[][] = [];
    const nudges: string[] = [];
    let seedText = "";
    let i = 0;
    const driver: GameCodeDriver = {
      seed: (_t, first) => {
        seedText = typeof first === "string" ? first : first.text;
      },
      addUserMessage: (text) => {
        nudges.push(typeof text === "string" ? text : text.text);
      },
      addToolResults: (rs) => {
        toolResults.push(rs);
      },
      runTurn: () => Promise.resolve(turns[Math.min(i++, turns.length - 1)]),
    };
    return { driver, toolResults, nudges, getSeedText: () => seedText };
  }

  it("generates after the write with the fresh background as style reference", async () => {
    const captured = capturingDriver([
      turn([{ id: "b1", name: "generate_background_image", input: { scene: "a meadow" } }]),
      turn([
        {
          id: "w1",
          name: "write_game_code",
          input: { code: compliant(PLACEHOLDER_BLOCK), markdown: "m", title: "T", capabilities: [] },
        },
      ]),
      turn([{ id: "p1", name: "generate_preview_image", input: { scene: "a counting fox" } }]),
      turn([]),
    ]);
    mockDriverFactory = () => captured.driver;

    const generatePreview = vi.fn().mockResolvedValue(PREVIEW);
    const result = await runGameAgent({
      provider: "anthropic",
      apiKey: "k",
      model: "m",
      task: TASK,
      onGenerateBackgroundImage: vi.fn().mockResolvedValue(BG),
      onGeneratePreviewImage: generatePreview,
    });

    expect(generatePreview).toHaveBeenCalledWith("a counting fox", BG);
    // The preview tool result never carries image bytes into the transcript.
    expect(captured.toolResults[2][0].content).not.toContain("data:image");
    expect(result.previewImage).toBe(PREVIEW);
    expect(result.previewOnly).toBeUndefined();
    expect(captured.getSeedText()).toContain("generate_preview_image");
  });

  it("softens the nudge when the game already has a preview and stays silent when disabled", async () => {
    const writeTurn = turn([
      {
        id: "w1",
        name: "write_game_code",
        input: { code: compliant(""), markdown: "m", title: "T", capabilities: [] },
      },
    ]);

    const existing = capturingDriver([writeTurn, turn([])]);
    mockDriverFactory = () => existing.driver;
    await runGameAgent({
      provider: "anthropic",
      apiKey: "k",
      model: "m",
      task: TASK,
      onGeneratePreviewImage: vi.fn().mockResolvedValue(PREVIEW),
      hasExistingPreviewImage: true,
    });
    expect(existing.getSeedText()).toContain("already has a list preview");

    const disabled = capturingDriver([writeTurn, turn([])]);
    mockDriverFactory = () => disabled.driver;
    await runGameAgent({ provider: "anthropic", apiKey: "k", model: "m", task: TASK });
    expect(disabled.getSeedText()).not.toContain("generate_preview_image");
  });

  it("completes a preview-only update without a write, returning the bundle untouched", async () => {
    const placeholderCode = compliant(PLACEHOLDER_BLOCK);
    const inlinedCode = placeholderCode.replace("{{BACKGROUND_IMAGE}}", BG);
    const captured = capturingDriver([
      turn([{ id: "p1", name: "generate_preview_image", input: { scene: "a fox" } }]),
      turn([], true),
    ]);
    mockDriverFactory = () => captured.driver;

    const result = await runGameAgent({
      provider: "anthropic",
      apiKey: "k",
      model: "m",
      task: {
        ...TASK,
        taskType: "update_game",
        payload: { instruction: "make a new preview image", existingCode: inlinedCode },
      },
      onGeneratePreviewImage: vi.fn().mockResolvedValue(PREVIEW),
      hasExistingPreviewImage: true,
    });

    expect(result.previewOnly).toBe(true);
    expect(result.previewImage).toBe(PREVIEW);
    // The existing bundle survives untouched (placeholder form + carried image).
    expect(result.codeBundle).toBe(placeholderCode);
    expect(result.backgroundImage).toBe(BG);
    // The model was never nudged into a pointless full rewrite.
    expect(captured.nudges).toEqual([]);
  });

  it("ends a failed preview-only update gracefully with the failure flag", async () => {
    const captured = capturingDriver([
      turn([{ id: "p1", name: "generate_preview_image", input: { scene: "a fox" } }]),
      turn([], true),
    ]);
    mockDriverFactory = () => captured.driver;

    const result = await runGameAgent({
      provider: "anthropic",
      apiKey: "k",
      model: "m",
      task: {
        ...TASK,
        taskType: "update_game",
        payload: { instruction: "make a new preview image", existingCode: compliant("") },
      },
      onGeneratePreviewImage: vi.fn().mockRejectedValue(new Error("provider down")),
      hasExistingPreviewImage: true,
    });

    expect(result.previewOnly).toBe(true);
    expect(result.previewImage).toBeUndefined();
    expect(result.previewImageFailed).toBe(true);
    expect(captured.nudges).toEqual([]);
  });

  it("propagates a preview failure on a normal build without failing the build", async () => {
    const captured = capturingDriver([
      turn([
        {
          id: "w1",
          name: "write_game_code",
          input: { code: compliant(""), markdown: "m", title: "T", capabilities: [] },
        },
      ]),
      turn([{ id: "p1", name: "generate_preview_image", input: { scene: "a fox" } }]),
      turn([]),
    ]);
    mockDriverFactory = () => captured.driver;

    const result = await runGameAgent({
      provider: "anthropic",
      apiKey: "k",
      model: "m",
      task: TASK,
      onGeneratePreviewImage: vi.fn().mockRejectedValue(new Error("provider down")),
    });

    expect(result.previewImage).toBeUndefined();
    expect(result.previewImageFailed).toBe(true);
    expect(result.previewOnly).toBeUndefined();
    expect(result.validationPassed).toBe(true);
  });
});

describe("surgical edit loop integration", () => {
  // Goal-compliant on purpose: the baseline metadata below says progressKind
  // "goal" with a required "score" metric, and final validation enforces both.
  const compliant = (marker: string): string =>
    `<!doctype html><html><head><script type="application/dodi-translations">{"sourceLocale":"en","locales":{"en":{"game.title":"Game"}}}</script></head><body><script>
      var speed = ${marker};
      var dodiState = { progressKind: 'goal', progress: 0, metrics: { score: 0 } };
      document.title = dodi.translate('game.title');
      function report() { parent.postMessage({ type: 'game:progress', payload: dodiState }, '*'); }
      window.addEventListener('message', function (e) {
        if (e.data.type === 'dodi:init') parent.postMessage({ type: 'game:ready', payload: { capabilities: [] } }, '*');
        if (e.data.type === 'dodi:command') { report(); parent.postMessage({ type: 'game:result' }, '*'); }
      });
    </script></body></html>`;

  const turn = (toolCalls: GameTurn["toolCalls"]): GameTurn => ({
    toolCalls,
    text: "",
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

  const EXISTING_META = {
    title: "Ball Game",
    description: "Bounce a ball",
    tags: ["math"],
    progressKind: "goal" as const,
    successCriteria: {
      description: "Reach 10",
      match: "all" as const,
      conditions: [{ metric: "score" as const, op: ">=" as const, value: 10 }],
      requiredMetrics: ["score" as const],
    },
    capabilities: [],
  };

  const updateTask = (existingCode: string, withMeta = true): AgentTaskRequest => ({
    ...TASK,
    taskType: "update_game",
    payload: {
      instruction: "make it faster",
      existingCode,
      existingMarkdown: "# Ball Game",
      ...(withMeta ? { existingMeta: EXISTING_META } : {}),
    },
  });

  it("applies edits and preserves the metadata baseline without a full write", async () => {
    const captured = capturingDriver([
      turn([{ id: "r1", name: "read_existing_game", input: {} }]),
      turn([
        {
          id: "e1",
          name: "edit_game_code",
          input: {
            edits: [{ old_text: "var speed = 5;", new_text: "var speed = 9;" }],
            changeSummary: "- the ball moves faster",
          },
        },
      ]),
      turn([]),
    ]);
    mockDriverFactory = () => captured.driver;

    const result = await runGameAgent({
      provider: "anthropic",
      apiKey: "k",
      model: "m",
      task: updateTask(compliant("5")),
    });

    expect(result.codeBundle).toContain("var speed = 9;");
    expect(result.validationPassed).toBe(true);
    expect(result.changeSummary).toBe("- the ball moves faster");
    // A pure-edit run must carry the game's real metadata — otherwise the
    // caller would persist placeholders over the parent's settings.
    expect(result.title).toBe("Ball Game");
    expect(result.description).toBe("Bounce a ball");
    expect(result.tags).toEqual(["math"]);
    expect(result.progressKind).toBe("goal");
    expect(result.successCriteria).toEqual(EXISTING_META.successCriteria);
    expect(result.markdown).toBe("# Ball Game");
    // The task steps must advertise the edit tool.
    expect(captured.getSeedText()).toContain("edit_game_code");
  });

  it("edits the code it just wrote in a generate run", async () => {
    const captured = capturingDriver([
      turn([
        {
          id: "w1",
          name: "write_game_code",
          input: { code: compliant("5"), markdown: "m", title: "T", capabilities: [] },
        },
      ]),
      turn([
        {
          id: "e1",
          name: "edit_game_code",
          input: {
            edits: [{ old_text: "var speed = 5;", new_text: "var speed = 7;" }],
            changeSummary: "- tuned the speed",
          },
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
    });

    expect(result.codeBundle).toContain("var speed = 7;");
    expect(result.title).toBe("T");
  });

  it("leaves the code untouched after a failed edit and accepts the retry", async () => {
    const captured = capturingDriver([
      turn([
        {
          id: "e1",
          name: "edit_game_code",
          input: {
            edits: [{ old_text: "var speed = 99;", new_text: "var speed = 9;" }],
            changeSummary: "- bad anchor",
          },
        },
      ]),
      turn([
        {
          id: "e2",
          name: "edit_game_code",
          input: {
            edits: [{ old_text: "var speed = 5;", new_text: "var speed = 9;" }],
            changeSummary: "- the ball moves faster",
          },
        },
      ]),
      turn([]),
    ]);
    mockDriverFactory = () => captured.driver;

    const result = await runGameAgent({
      provider: "anthropic",
      apiKey: "k",
      model: "m",
      task: updateTask(compliant("5")),
    });

    const failed = JSON.parse(captured.toolResults[0][0].content) as { ok: boolean };
    expect(failed.ok).toBe(false);
    expect(result.codeBundle).toContain("var speed = 9;");
    // Only the successful call's summary survives.
    expect(result.changeSummary).toBe("- the ball moves faster");
  });

  it("combines summaries across edits and resets them on a full write", async () => {
    const captured = capturingDriver([
      turn([
        {
          id: "e1",
          name: "edit_game_code",
          input: {
            edits: [{ old_text: "var speed = 5;", new_text: "var speed = 6;" }],
            changeSummary: "- faster",
          },
        },
      ]),
      turn([
        {
          id: "e2",
          name: "edit_game_code",
          input: {
            edits: [{ old_text: "var speed = 6;", new_text: "var speed = 7;" }],
            changeSummary: "- faster still",
          },
        },
      ]),
      turn([]),
    ]);
    mockDriverFactory = () => captured.driver;

    const combined = await runGameAgent({
      provider: "anthropic",
      apiKey: "k",
      model: "m",
      task: updateTask(compliant("5")),
    });
    expect(combined.changeSummary).toBe("- faster\n- faster still");

    const rewritten = capturingDriver([
      turn([
        {
          id: "e1",
          name: "edit_game_code",
          input: {
            edits: [{ old_text: "var speed = 5;", new_text: "var speed = 6;" }],
            changeSummary: "- faster",
          },
        },
      ]),
      turn([
        {
          id: "w1",
          name: "write_game_code",
          input: {
            code: compliant("8"),
            markdown: "m",
            title: "T",
            capabilities: [],
            changeSummary: "- rebuilt from scratch",
          },
        },
      ]),
      turn([]),
    ]);
    mockDriverFactory = () => rewritten.driver;

    const afterWrite = await runGameAgent({
      provider: "anthropic",
      apiKey: "k",
      model: "m",
      task: updateTask(compliant("5")),
    });
    expect(afterWrite.changeSummary).toBe("- rebuilt from scratch");
  });

  it("falls back to placeholder metadata when the payload carries no baseline", async () => {
    const captured = capturingDriver([
      turn([
        {
          id: "e1",
          name: "edit_game_code",
          input: {
            edits: [{ old_text: "var speed = 5;", new_text: "var speed = 9;" }],
            changeSummary: "- faster",
          },
        },
      ]),
      turn([]),
    ]);
    mockDriverFactory = () => captured.driver;

    const result = await runGameAgent({
      provider: "anthropic",
      apiKey: "k",
      model: "m",
      task: updateTask(compliant("5"), false),
    });

    expect(result.codeBundle).toContain("var speed = 9;");
    expect(result.tags).toEqual([]);
  });
});

describe("live activity + narration", () => {
  const idleTurn: GameTurn = {
    toolCalls: [],
    text: "",
    hasText: false,
    expectsToolResults: false,
    stopReason: "end_turn",
    usage: emptyUsage,
  };

  function captureDriverOpts(): { get: () => GameDriverOptions } {
    let opts: GameDriverOptions | undefined;
    mockDriverFactory = (...args: unknown[]) => {
      opts = args[1] as GameDriverOptions;
      return driverReturning([idleTurn]);
    };
    return { get: () => opts! };
  }

  it("flips the step early on tool_started and forwards events to onActivity", async () => {
    const captured = captureDriverOpts();
    const steps: AgentStep[] = [];
    const events: AgentActivityEvent[] = [];
    await runGameAgent({
      provider: "anthropic",
      apiKey: "k",
      model: "m",
      task: TASK,
      onStep: (s) => steps.push(s),
      onActivity: (e) => events.push(e),
    }).catch(() => {});

    // Simulate the driver streaming a tool-call start + narration mid-turn.
    captured.get().onActivity!({ type: "tool_started", name: "write_game_code" });
    captured.get().onActivity!({ type: "narration_delta", text: "hi" });

    expect(steps).toContain("writing_code");
    expect(events).toEqual([
      { type: "tool_started", name: "write_game_code" },
      { type: "narration_delta", text: "hi" },
    ]);
  });

  it("treats a streaming edit call as the writing step too", async () => {
    const captured = captureDriverOpts();
    const steps: AgentStep[] = [];
    await runGameAgent({
      provider: "anthropic",
      apiKey: "k",
      model: "m",
      task: TASK,
      onStep: (s) => steps.push(s),
    }).catch(() => {});

    captured.get().onActivity!({ type: "tool_started", name: "edit_game_code" });
    expect(steps).toContain("writing_code");
  });

  it("passes the narration language into the system prompt", async () => {
    const captured = captureDriverOpts();
    await runGameAgent({
      provider: "anthropic",
      apiKey: "k",
      model: "m",
      task: TASK,
      narrationLanguage: "German",
    }).catch(() => {});
    expect(captured.get().systemPrompt).toContain("## Working Aloud");
    expect(captured.get().systemPrompt).toContain("sentence in German");
  });

  it("omits the working-aloud section without a narration language", async () => {
    const captured = captureDriverOpts();
    await runGameAgent({ provider: "anthropic", apiKey: "k", model: "m", task: TASK }).catch(
      () => {},
    );
    expect(captured.get().systemPrompt).not.toContain("## Working Aloud");
  });

  it("normalizes a mid-stream abort into AgentAbortedError", async () => {
    const controller = new AbortController();
    mockDriverFactory = () => ({
      seed: () => {},
      addUserMessage: () => {},
      addToolResults: () => {},
      runTurn: () => {
        // The Stop button aborts while the provider request is in flight — the
        // SDK then rejects with its own error type, not AgentAbortedError.
        controller.abort();
        return Promise.reject(new Error("Request was aborted."));
      },
    });
    await expect(
      runGameAgent({
        provider: "anthropic",
        apiKey: "k",
        model: "m",
        task: TASK,
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(AgentAbortedError);
  });
});

describe("visual check loop integration", () => {
  const FRAME = "data:image/jpeg;base64,RlJBTUU=";
  const BG = "data:image/jpeg;base64,QkFDS0dST1VORA==";
  const PLACEHOLDER_BLOCK = `<style id="background-image">:root{--background-image:url("{{BACKGROUND_IMAGE}}")}</style>`;
  const compliant = (extra = ""): string =>
    `<!doctype html><html><head><script type="application/dodi-translations">{"sourceLocale":"en","locales":{"en":{"game.title":"Game"}}}</script>${extra}</head><body><script>
      document.title = dodi.translate('game.title');
      window.addEventListener('message', function (e) {
        if (e.data.type === 'dodi:init') parent.postMessage({ type: 'game:ready', payload: { capabilities: [] } }, '*');
        if (e.data.type === 'dodi:command') parent.postMessage({ type: 'game:result' }, '*');
      });
    </script></body></html>`;

  const turn = (toolCalls: GameTurn["toolCalls"], hasText = false): GameTurn => ({
    toolCalls,
    text: hasText ? "Looks good." : "",
    hasText,
    expectsToolResults: toolCalls.length > 0,
    stopReason: toolCalls.length > 0 ? "tool_use" : "end_turn",
    usage: emptyUsage,
  });
  const writeTurn = (code: string): GameTurn =>
    turn([
      {
        id: "w1",
        name: "write_game_code",
        input: { code, markdown: "m", title: "T", capabilities: [] },
      },
    ]);
  const editTurn = (id: string): GameTurn =>
    turn([
      {
        id,
        name: "edit_game_code",
        input: {
          edits: [
            { old_text: "document.title = dodi.translate('game.title');", new_text: "document.title = dodi.translate('game.title') + '!';" },
          ],
          changeSummary: "- fixed",
        },
      },
    ]);
  const rendered = (patch: Partial<RenderOutput> = {}): RenderOutput => ({
    frames: [{ label: "initial", image: FRAME }],
    ready: true,
    warnings: [],
    errors: [],
    ...patch,
  });
  type RenderOutput = NonNullable<Awaited<ReturnType<NonNullable<Parameters<typeof runGameAgent>[0]["onViewGame"]>>>>;

  /** Scripted driver that also records user messages (the forced check's channel). */
  function capturingDriver(turns: GameTurn[]) {
    const toolResults: GameToolResult[][] = [];
    const userMessages: UserContent[] = [];
    let seedText = "";
    let turnsRun = 0;
    const driver: GameCodeDriver = {
      seed: (_t, first) => {
        seedText = typeof first === "string" ? first : first.text;
      },
      addUserMessage: (content) => {
        userMessages.push(typeof content === "string" ? { text: content } : content);
      },
      addToolResults: (rs) => {
        toolResults.push(rs);
      },
      runTurn: () => Promise.resolve(turns[Math.min(turnsRun++, turns.length - 1)]),
    };
    return { driver, toolResults, userMessages, getSeedText: () => seedText, turns: () => turnsRun };
  }

  const run = (driver: GameCodeDriver, onViewGame?: Parameters<typeof runGameAgent>[0]["onViewGame"]) => {
    mockDriverFactory = () => driver;
    return runGameAgent({ provider: "anthropic", apiKey: "k", model: "m", task: TASK, onViewGame });
  };

  it("exposes view_game, the prompt section and the recipe step only with a service", async () => {
    let captured: GameDriverOptions | undefined;
    mockDriverFactory = (...args: unknown[]) => {
      captured = args[1] as GameDriverOptions;
      return driverReturning([writeTurn(compliant()), turn([])]);
    };
    await runGameAgent({ provider: "anthropic", apiKey: "k", model: "m", task: TASK });
    expect(captured!.tools!.map((t) => t.name)).not.toContain("view_game");
    expect(captured!.systemPrompt).not.toContain("## Visual Check");

    const withService = capturingDriver([writeTurn(compliant()), turn([])]);
    mockDriverFactory = (...args: unknown[]) => {
      captured = args[1] as GameDriverOptions;
      return withService.driver;
    };
    await runGameAgent({
      provider: "anthropic",
      apiKey: "k",
      model: "m",
      task: TASK,
      onViewGame: vi.fn().mockResolvedValue(rendered()),
    });
    expect(captured!.tools!.map((t) => t.name)).toContain("view_game");
    expect(captured!.systemPrompt).toContain("## Visual Check");
    expect(withService.getSeedText()).toContain("5. Look at the finished game with view_game");
    expect(withService.getSeedText()).toContain("A visual check is available");
  });

  it("view_game renders the bundle with its background and hands the frames back as a tool result", async () => {
    const captured = capturingDriver([
      turn([{ id: "b1", name: "generate_background_image", input: { scene: "meadow" } }]),
      writeTurn(compliant(PLACEHOLDER_BLOCK)),
      turn([{ id: "v1", name: "view_game", input: { steps: [{ label: "after a tap", command: { type: "submit_answer" } }] } }]),
      turn([], true),
    ]);
    const onViewGame = vi.fn().mockResolvedValue(
      rendered({ frames: [{ label: "initial", image: FRAME }, { label: "after a tap", image: FRAME }] }),
    );
    mockDriverFactory = () => captured.driver;
    const result = await runGameAgent({
      provider: "anthropic",
      apiKey: "k",
      model: "m",
      task: TASK,
      onGenerateBackgroundImage: vi.fn().mockResolvedValue(BG),
      onViewGame,
    });

    expect(onViewGame).toHaveBeenCalledTimes(1);
    const input = onViewGame.mock.calls[0][0];
    expect(input.code).toContain(BG);
    expect(input.code).not.toContain("{{BACKGROUND_IMAGE}}");
    expect(input.steps).toEqual([{ label: "after a tap", command: { type: "submit_answer" } }]);
    const viewResult = captured.toolResults[2][0];
    expect(viewResult.images).toEqual([FRAME, FRAME]);
    expect(viewResult.content).toContain("2. after a tap");
    // The model looked itself: no forced check, no extra user message.
    expect(captured.userMessages).toHaveLength(0);
    expect(result.visualCheckFailed).toBeUndefined();
    expect(result.codeBundle).toContain("{{BACKGROUND_IMAGE}}");
    expect(result.validationPassed).toBe(true);
  });

  it("forces one check when the model never looked, and lets it fix what it sees", async () => {
    const captured = capturingDriver([
      writeTurn(compliant()),
      turn([], true), // finishes without view_game
      editTurn("e1"), // fix round 1
      turn([{ id: "val", name: "validate_game", input: {} }]), // fix round 2
      turn([], true), // never reached: rounds are bounded
    ]);
    const onViewGame = vi.fn().mockResolvedValue(rendered());
    const steps: AgentStep[] = [];
    mockDriverFactory = () => captured.driver;
    const result = await runGameAgent({
      provider: "anthropic",
      apiKey: "k",
      model: "m",
      task: TASK,
      onViewGame,
      onStep: (s) => steps.push(s),
    });

    expect(onViewGame).toHaveBeenCalledTimes(1);
    expect(onViewGame.mock.calls[0][0].steps).toEqual([]);
    expect(steps).toContain("visual_check");
    expect(captured.userMessages).toHaveLength(1);
    const [message] = captured.userMessages;
    expect(message.images).toEqual([FRAME]);
    expect(message.text).toContain("rendered your game for you");
    expect(message.text).toContain("1. initial");
    expect(message.text).toContain("edit_game_code");
    // write, end, edit, validate = 4 turns; the 5th scripted turn is never run.
    expect(captured.turns()).toBe(4);
    expect(result.iterationCount).toBe(4);
    expect(result.codeBundle).toContain("dodi.translate('game.title') + '!'");
    expect(result.validationPassed).toBe(true);
    expect(result.visualCheckFailed).toBeUndefined();
  });

  it("bounds the fix rounds even when the model keeps editing", async () => {
    const captured = capturingDriver([writeTurn(compliant()), turn([], true), editTurn("e1")]);
    mockDriverFactory = () => captured.driver;
    await run(captured.driver, vi.fn().mockResolvedValue(rendered()));
    expect(captured.turns()).toBe(2 + AGENT_LIMITS.MAX_VISUAL_FIX_ROUNDS);
  });

  it("stops the fix round as soon as the model answers without a tool call", async () => {
    const captured = capturingDriver([writeTurn(compliant()), turn([], true)]);
    await run(captured.driver, vi.fn().mockResolvedValue(rendered()));
    // write, end, one confirmation turn.
    expect(captured.turns()).toBe(3);
  });

  it("reports a crash on init as a runtime failure in the forced check", async () => {
    const captured = capturingDriver([writeTurn(compliant()), turn([], true)]);
    await run(
      captured.driver,
      vi.fn().mockResolvedValue(rendered({ ready: false, frames: [], errors: ["TypeError: boom"] })),
    );
    const [message] = captured.userMessages;
    expect(message.text).toContain("RUNTIME FAILURE");
    expect(message.text).toContain("TypeError: boom");
    expect(message.images).toEqual([]);
  });

  it("an unavailable service flags visualCheckFailed but never fails the build", async () => {
    // Forced check path: the render returns nothing.
    const forced = capturingDriver([writeTurn(compliant()), turn([], true)]);
    const forcedResult = await run(forced.driver, vi.fn().mockResolvedValue(null));
    expect(forcedResult.visualCheckFailed).toBe(true);
    expect(forcedResult.validationPassed).toBe(true);
    expect(forced.userMessages).toHaveLength(0);
    expect(forced.turns()).toBe(2);

    // Model-initiated path: view_game came back empty, so no forced retry either.
    const own = capturingDriver([
      writeTurn(compliant()),
      turn([{ id: "v1", name: "view_game", input: {} }]),
      turn([], true),
    ]);
    const onViewGame = vi.fn().mockRejectedValue(new Error("down"));
    const ownResult = await run(own.driver, onViewGame);
    expect(onViewGame).toHaveBeenCalledTimes(1);
    expect(ownResult.visualCheckFailed).toBe(true);
    expect(ownResult.validationPassed).toBe(true);
    expect(own.toolResults[1][0].images).toBeUndefined();
  });

  const CLOCK_OVER_BAR = 'div.clock "12" covers div.progress (284×14 px at 160,120), frame 1 (initial)';

  it("hands measured layout collisions to the model as facts to fix", async () => {
    const captured = capturingDriver([
      writeTurn(compliant()),
      turn([{ id: "v1", name: "view_game", input: {} }]),
      turn([], true),
    ]);
    await run(captured.driver, vi.fn().mockResolvedValue(rendered({ layoutIssues: [CLOCK_OVER_BAR] })));
    const report = captured.toolResults[1][0].content;
    expect(report).toContain("LAYOUT COLLISIONS measured");
    expect(report).toContain(`- ${CLOCK_OVER_BAR}`);
    expect(report).toContain("UI elements never collide");
  });

  it("re-renders the final code when the model's last look found collisions, and lets it fix them", async () => {
    const captured = capturingDriver([
      writeTurn(compliant()),
      turn([{ id: "v1", name: "view_game", input: {} }]), // sees the collision
      turn([], true), // finishes without fixing or looking again
      editTurn("e1"), // fix round after the re-check
      turn([], true),
    ]);
    const onViewGame = vi
      .fn()
      .mockResolvedValueOnce(rendered({ layoutIssues: [CLOCK_OVER_BAR] }))
      .mockResolvedValueOnce(rendered({ layoutIssues: [CLOCK_OVER_BAR] }));
    await run(captured.driver, onViewGame);

    expect(onViewGame).toHaveBeenCalledTimes(2);
    expect(captured.userMessages).toHaveLength(1);
    const [message] = captured.userMessages;
    expect(message.text).toContain("measured layout collisions, so the app rendered your final code again");
    expect(message.text).toContain(CLOCK_OVER_BAR);
    // write, view, end, edit, confirm.
    expect(captured.turns()).toBe(5);
  });

  it("a clean re-check ends quietly, without an extra model turn", async () => {
    const captured = capturingDriver([
      writeTurn(compliant()),
      turn([{ id: "v1", name: "view_game", input: {} }]),
      editTurn("e1"), // fixes the collision but never looks again
      turn([], true),
    ]);
    const onViewGame = vi
      .fn()
      .mockResolvedValueOnce(rendered({ layoutIssues: [CLOCK_OVER_BAR] }))
      .mockResolvedValueOnce(rendered());
    await run(captured.driver, onViewGame);

    expect(onViewGame).toHaveBeenCalledTimes(2);
    expect(onViewGame.mock.calls[1][0].code).toContain("dodi.translate('game.title') + '!'");
    expect(captured.userMessages).toHaveLength(0);
    expect(captured.turns()).toBe(4);
  });

  it("no re-check when the model's last look was clean", async () => {
    const captured = capturingDriver([
      writeTurn(compliant()),
      turn([{ id: "v1", name: "view_game", input: {} }]),
      turn([{ id: "v2", name: "view_game", input: {} }]),
      turn([], true),
    ]);
    const onViewGame = vi
      .fn()
      .mockResolvedValueOnce(rendered({ layoutIssues: [CLOCK_OVER_BAR] }))
      .mockResolvedValueOnce(rendered());
    await run(captured.driver, onViewGame);
    expect(onViewGame).toHaveBeenCalledTimes(2);
    expect(captured.userMessages).toHaveLength(0);
  });

  it("without a service the loop is unchanged: no render, no flag, no extra turns", async () => {
    const captured = capturingDriver([writeTurn(compliant()), turn([], true)]);
    const result = await run(captured.driver);
    expect(captured.turns()).toBe(2);
    expect(captured.userMessages).toHaveLength(0);
    expect(result.visualCheckFailed).toBeUndefined();
  });
});

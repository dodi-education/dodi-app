import { describe, expect, it, vi } from "vitest";
import type { GameCommand } from "@dodi/types/games";

import type { CompanionContext } from "./companion-session";
import {
  GAME_TEXT_REQUEST_COOLDOWN_MS,
  GAME_VOICE_REQUEST_COOLDOWN_MS,
  GAME_VOICE_TEXT_MAX_CHARS,
  type GameCompanionHost,
  type GameCompanionSessionState,
  type GameGenerators,
  NoImageModelError,
  NoThinkingModelError,
  createGameCompanion,
} from "./game-companion";
import type { GamePlayInfo } from "./game-play";

const INFO: GamePlayInfo = {
  gameId: "game-1",
  kidId: "kid-1",
  title: "Count the stars",
  description: "A counting game",
  codeBundle: "",
  markdown: "",
  capabilities: [],
  drawingStyle: "mandala",
  goal: undefined,
};

const SLOT_STATE = {
  contentSlots: [{ id: "story", description: "A short story", maxChars: 200 }],
};

function setup(opts: { context?: CompanionContext; generators?: Partial<GameGenerators> } = {}) {
  const sent: GameCommand[] = [];
  const errors: Array<string | null> = [];
  const activity: string[] = [];
  const resolved: Array<{ ok: boolean; message?: string; error?: string }> = [];
  let clock = 100_000;
  const state: GameCompanionSessionState = {
    context: opts.context ?? {
      type: "game",
      gameId: "game-1",
      markdown: "",
      codeBundle: "",
      gameState: SLOT_STATE,
      capabilities: [],
    },
    beginAiActivity: (kind) => activity.push(`+${kind}`),
    endAiActivity: (kind) => activity.push(`-${kind}`),
    resolveClientCommand: (result) => resolved.push(result),
    speakGameVoiceText: vi.fn(() => ({ ok: true as const })),
  };
  const generators: GameGenerators = {
    generateDrawing: vi.fn(async () => "data:image/png;base64,AAA"),
    generateText: vi.fn(async () => ({ story: "Once upon a time" })),
    ...opts.generators,
  };
  const host: GameCompanionHost = {
    sandbox: () => ({ sendCommand: (command) => sent.push(command) }),
    saveSnapshot: vi.fn(async (title?: string) => ({ title: title ?? "Snapshot" })),
    shareSnapshot: vi.fn(async () => ({ kind: "ok" as const, title: "Snap", displayName: "Mia" })),
    onGameError: (error) => errors.push(error),
    messages: {
      noImageModel: () => "no image model",
      drawingFailed: () => "drawing failed",
      noThinkingModel: () => "no thinking model",
      textGenerationFailed: () => "text failed",
      snapshotSaveFailed: () => "save failed",
      snapshotShareFailed: () => "share failed",
      sandboxNotReady: () => "sandbox not ready",
    },
  };
  const companion = createGameCompanion(
    { session: { getState: () => state }, generators },
    INFO,
    () => clock,
  );
  companion.setHost(host);
  const tick = (ms: number) => {
    clock += ms;
  };
  return { companion, host, state, generators, sent, errors, activity, resolved, tick };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("game companion: dodi's commands", () => {
  it("passes plain bridge commands to the sandbox", () => {
    const t = setup();
    t.companion.runCommands([{ type: "next_task" }, { type: "submit_answer", payload: { answer: 3 } }]);
    expect(t.sent).toEqual([{ type: "next_task" }, { type: "submit_answer", payload: { answer: 3 } }]);
  });

  it("shows the sandbox-not-ready error when nothing is mounted", () => {
    const t = setup();
    t.companion.setHost({ ...t.host, sandbox: () => null });
    t.companion.runCommands([{ type: "next_task" }]);
    expect(t.errors).toEqual(["sandbox not ready"]);
  });

  it("generate_drawing pushes the picture in the game's style and releases the voice call", async () => {
    const t = setup();
    t.companion.runCommands([{ type: "generate_drawing", payload: { subject: "a cat" } }]);
    await flush();
    expect(t.generators.generateDrawing).toHaveBeenCalledWith("a cat", "mandala");
    expect(t.sent).toEqual([{ type: "set_generated_image", payload: { dataUrl: "data:image/png;base64,AAA" } }]);
    expect(t.resolved).toEqual([{ ok: true }]);
    expect(t.activity).toEqual(["+image", "-image"]);
  });

  it("generate_drawing without an image model shows that and fails the voice call", async () => {
    const t = setup({
      generators: {
        generateDrawing: async () => {
          throw new NoImageModelError();
        },
      },
    });
    t.companion.runCommands([{ type: "generate_drawing", payload: { subject: "a cat" } }]);
    await flush();
    expect(t.errors).toEqual([null, "no image model"]);
    expect(t.resolved).toEqual([{ ok: false, error: "no image model" }]);
    expect(t.activity).toEqual(["+image", "-image"]);
  });

  it("generate_text fills the declared slots (no game id for snapshot sessions)", async () => {
    const t = setup();
    t.companion.update({
      ...INFO,
      snapshot: { id: "snap-1", savedState: { version: 1, state: {} } as never, gameId: "game-1" },
      inlineContext: { title: "Original", description: "Orig desc" },
    });
    t.companion.runCommands([{ type: "generate_text", payload: { request: "dragons" } }]);
    await flush();
    expect(t.generators.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        kidId: "kid-1",
        gameId: null,
        request: "dragons",
        gameTitle: "Original",
        gameDescription: "Orig desc",
      }),
    );
    expect(t.sent).toEqual([{ type: "set_generated_text", payload: { slots: { story: "Once upon a time" } } }]);
    expect(t.resolved).toHaveLength(1);
    expect(t.resolved[0].ok).toBe(true);
    expect(t.activity).toEqual(["+writing", "-writing"]);
  });

  it("generate_text with no slots answers the voice call without generating", async () => {
    const t = setup({
      context: { type: "game", gameId: "g", markdown: "", codeBundle: "", gameState: {}, capabilities: [] },
    });
    t.companion.runCommands([{ type: "generate_text" }]);
    await flush();
    expect(t.generators.generateText).not.toHaveBeenCalled();
    expect(t.resolved[0].ok).toBe(false);
  });

  it("generate_text without a thinking model reports it", async () => {
    const t = setup({
      generators: {
        generateText: async () => {
          throw new NoThinkingModelError();
        },
      },
    });
    t.companion.runCommands([{ type: "generate_text" }]);
    await flush();
    expect(t.resolved).toEqual([{ ok: false, error: "no thinking model" }]);
  });

  it("save_snapshot and share_snapshot run the play's flows and report back", async () => {
    const t = setup();
    t.companion.runCommands([{ type: "save_snapshot", payload: { title: "My castle" } }]);
    await flush();
    expect(t.host.saveSnapshot).toHaveBeenCalledWith("My castle");
    expect(t.resolved[0]).toMatchObject({ ok: true });
    expect(t.resolved[0].message).toContain('"My castle"');

    t.companion.runCommands([{ type: "share_snapshot", payload: { friend_name: "Mia" } }]);
    await flush();
    expect(t.host.shareSnapshot).toHaveBeenCalledWith("Mia", undefined);
    expect(t.resolved[1].message).toContain("Mia");
    expect(t.activity).toEqual(["+thinking", "-thinking", "+thinking", "-thinking"]);
  });

  it("share_snapshot with an unknown friend asks which one", async () => {
    const t = setup();
    t.companion.setHost({
      ...t.host,
      shareSnapshot: async () => ({ kind: "unknown", candidates: ["Ana", "Ben"] }),
    });
    t.companion.runCommands([{ type: "share_snapshot", payload: { friend_name: "Zoe" } }]);
    await flush();
    expect(t.resolved[0].ok).toBe(false);
    expect(t.resolved[0].error).toContain("Ana, Ben");
  });

  it("a failed save shows the banner and fails the voice call", async () => {
    const t = setup();
    t.companion.setHost({
      ...t.host,
      saveSnapshot: async () => {
        throw new Error("vault_locked");
      },
    });
    await t.companion.saveSnapshot();
    expect(t.errors).toEqual([null, "save failed"]);
    expect(t.resolved[0].ok).toBe(false);
  });
});

describe("game companion: the game's own requests", () => {
  it("rate-limits game-requested text and never touches the voice call", async () => {
    const t = setup();
    t.companion.handleGameTextRequest("more words");
    await flush();
    expect(t.generators.generateText).toHaveBeenCalledTimes(1);
    expect(t.resolved).toEqual([]);

    // Within the cooldown: denied.
    t.companion.handleGameTextRequest("again");
    await flush();
    expect(t.sent.at(-1)).toEqual({ type: "set_generated_text", payload: { slots: {}, error: "rate_limited" } });

    t.tick(GAME_TEXT_REQUEST_COOLDOWN_MS);
    t.companion.handleGameTextRequest("again");
    await flush();
    expect(t.generators.generateText).toHaveBeenCalledTimes(2);
  });

  it("game-requested text failures go back to the game", async () => {
    const t = setup({
      generators: {
        generateText: async () => {
          throw new Error("boom");
        },
      },
    });
    t.companion.handleGameTextRequest(undefined);
    await flush();
    expect(t.sent).toEqual([{ type: "set_generated_text", payload: { slots: {}, error: "generation_failed" } }]);
    expect(t.resolved).toEqual([]);
  });

  it("reads game text aloud through the session, capped and rate-limited", () => {
    const t = setup();
    t.companion.handleGameVoiceRequest("x".repeat(GAME_VOICE_TEXT_MAX_CHARS + 50));
    expect(t.state.speakGameVoiceText).toHaveBeenCalledWith("x".repeat(GAME_VOICE_TEXT_MAX_CHARS));
    expect(t.sent).toEqual([{ type: "set_generated_voice", payload: { ok: true } }]);

    t.companion.handleGameVoiceRequest("again");
    expect(t.sent.at(-1)).toEqual({ type: "set_generated_voice", payload: { ok: false, error: "rate_limited" } });

    t.tick(GAME_VOICE_REQUEST_COOLDOWN_MS);
    t.companion.handleGameVoiceRequest("   ");
    expect(t.sent.at(-1)).toEqual({ type: "set_generated_voice", payload: { ok: false, error: "empty_text" } });
  });

  it("an unavailable voice answers the game without counting against the cap", () => {
    const t = setup();
    vi.mocked(t.state.speakGameVoiceText).mockReturnValueOnce({ ok: false, error: "voice_unavailable" });
    t.companion.handleGameVoiceRequest("hello");
    expect(t.sent).toEqual([{ type: "set_generated_voice", payload: { ok: false, error: "voice_unavailable" } }]);
    // Not counted: an immediate retry is not rate-limited.
    t.companion.handleGameVoiceRequest("hello");
    expect(t.sent.at(-1)).toEqual({ type: "set_generated_voice", payload: { ok: true } });
    expect(t.errors).toEqual([]);
  });
});

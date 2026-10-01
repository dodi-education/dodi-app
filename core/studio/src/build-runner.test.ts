import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";

import { generateVaultMasterKey } from "@dodi/crypto";
import type { AgentCheckpoint, RunGameAgentParams } from "@dodi/ai/game-agent";
import type { AgentCodeResult } from "@dodi/types/tasks";
import { VaultSession } from "@dodi/vault";

vi.mock("@dodi/ai/game-agent", async (importOriginal) => {
  const original = await importOriginal<typeof import("@dodi/ai/game-agent")>();
  return { ...original, runGameAgent: vi.fn() };
});

import { AgentAbortedError, runGameAgent } from "@dodi/ai/game-agent";

import { createBuildManager } from "./build-manager";
import {
  buildAgentTask,
  runStudioBuild,
  type StudioBuildGame,
  type StudioBuildInput,
} from "./build-runner";
import type { CheckpointStore, GameCache, StudioPorts, StudioTelemetry } from "./ports";

const agent = vi.mocked(runGameAgent);

const KEY = "sk-ant-api03-secret-key";
const CODE = "<!doctype html><html><head></head><body>{{BACKGROUND_IMAGE}}</body></html>";
const BG = "data:image/jpeg;base64,QkFDSw==";

const GAME: StudioBuildGame = {
  title: "Space Math",
  tags: ["math"],
  description: "",
  learningGoal: "Add to 10",
  successDefinition: "3 rounds",
  progressKind: "open",
  successCriteria: { requiredMetrics: [] } as unknown as StudioBuildGame["successCriteria"],
  codeBundle: "",
  markdown: "",
  audienceIds: [],
  isFamily: true,
  built: false,
  perspective: null,
  generateBackgroundImage: false,
  generatePreviewImage: false,
  capabilities: [],
  previewImage: null,
};

const TEXTS = {
  buildSummaryTitle: "What changed",
  stopped: "Stopped.",
  paused: "Paused.",
  buildFailed: "Build failed.",
  previewUpdated: "New preview.",
  previewUpdateFailed: "Preview failed.",
};

const input = (patch: Partial<StudioBuildInput> = {}): StudioBuildInput => ({
  gameId: "game-1",
  game: GAME,
  text: "a rocket counting game",
  images: [],
  history: [],
  kids: [
    {
      id: "kid-1",
      name: "Mia",
      birthdate: null,
      memory: "Loves rockets",
      parent_notes: null,
      language: "de",
    },
  ],
  primaryKidId: "kid-1",
  narrationLocale: "en",
  texts: TEXTS,
  ...patch,
});

const result = (patch: Partial<AgentCodeResult> = {}): AgentCodeResult => ({
  taskType: "generate_game",
  title: "Space Math",
  description: "Count rockets",
  tags: ["math"],
  codeBundle: CODE,
  markdown: "# Space Math",
  backgroundImage: BG,
  metadata: { capabilities: [] },
  learningGoal: "Add to 10",
  successDefinition: "3 rounds",
  successCriteria: { requiredMetrics: [] } as unknown as AgentCodeResult["successCriteria"],
  progressKind: "open",
  changeSummary: "- added rockets",
  validationPassed: true,
  iterationCount: 3,
  validationRetries: 0,
  usage: { inputTokens: 10, outputTokens: 5, cacheWriteTokens: 0, cacheReadTokens: 0 },
  ...patch,
});

function memoryCheckpoints(): CheckpointStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    save: async (id, sealed) => {
      data.set(id, sealed);
    },
    load: async (id) => data.get(id) ?? null,
    clear: async (id) => {
      data.delete(id);
    },
  };
}

let session: VaultSession;
let patches: Array<Record<string, unknown>>;
let failPatch: boolean;
let ports: StudioPorts & {
  checkpoints: ReturnType<typeof memoryCheckpoints>;
  telemetry: {
    reportUsage: Mock<StudioTelemetry["reportUsage"]>;
    reportError: Mock<StudioTelemetry["reportError"]>;
  };
  games: { put: Mock<GameCache["put"]>; patchLocal: Mock<GameCache["patchLocal"]> };
};

beforeEach(() => {
  agent.mockReset();
  session = new VaultSession(generateVaultMasterKey());
  patches = [];
  failPatch = false;
  ports = {
    api: {
      request: async (path, init) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        patches.push({ path, ...body });
        if (failPatch) return new Response(JSON.stringify({ error: "Bundle too large" }), { status: 413 });
        // Echo the sealed row back the way the platform stores it.
        return new Response(
          JSON.stringify({
            id: "game-1",
            is_system: false,
            publication_requested_at: null,
            current_game_version_id: "v2",
            ...body,
          }),
        );
      },
    },
    session: async () => session,
    images: {
      downscale: async (url) => url,
      squareThumbnail: async () => "data:image/jpeg;base64,U1E=",
    },
    execution: {
      resolveGame: async () => ({ provider: "anthropic", model: "claude-test", apiKey: KEY }),
      resolveImage: async () => null,
    },
    screenshots: { forBuild: () => null },
    telemetry: {
      reportUsage: vi.fn<StudioTelemetry["reportUsage"]>(),
      reportError: vi.fn<StudioTelemetry["reportError"]>(),
    },
    games: { put: vi.fn<GameCache["put"]>(), patchLocal: vi.fn<GameCache["patchLocal"]>() },
    checkpoints: memoryCheckpoints(),
    now: () => 1_000,
  };
});

const AGENT_CHECKPOINT = { version: 1, phase: "main", phaseTurns: 1 } as unknown as AgentCheckpoint;

describe("runStudioBuild", () => {
  it("seals, persists and reports a finished build", async () => {
    agent.mockResolvedValue(result());
    const outcome = await runStudioBuild(input(), ports);

    expect(outcome.kind).toBe("built");
    if (outcome.kind !== "built") return;
    // The background is injected before anything persists.
    expect(outcome.code).toContain(BG);
    expect(outcome.code).not.toContain("{{BACKGROUND_IMAGE}}");

    const patch = patches[0];
    expect(patch.path).toBe("/api/games/game-1");
    for (const field of ["title", "code_bundle", "markdown", "learning_goal", "agent_transcript_enc"]) {
      expect(String(patch[field])).toMatch(/^enc:v1:/);
    }
    expect(JSON.stringify(patch)).not.toContain("Space Math");
    expect(JSON.stringify(patch)).not.toContain("rocket counting");
    expect(patch.audience).toEqual({ isFamily: true, audienceIds: [] });

    expect(outcome.savedRow?.code_bundle).toBe(outcome.code);
    expect(ports.games.put).toHaveBeenCalledWith(outcome.savedRow);
    expect(outcome.transcript.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(outcome.transcript[1].text).toBe("What changed\n- added rockets");
    expect(outcome.transcript[1].run?.outcome).toBe("completed");
    expect(ports.telemetry.reportUsage).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "game_create", gameId: "game-1", model: "claude-test" }),
    );
  });

  it("runs the agent on the device's key with the child context assembled locally", async () => {
    agent.mockResolvedValue(result());
    await runStudioBuild(input(), ports);
    const params = agent.mock.calls[0][0] as RunGameAgentParams;
    expect(params.apiKey).toBe(KEY);
    expect(params.task.taskType).toBe("generate_game");
    expect(params.task.childContext).toMatchObject({ name: "Mia", locale: "de" });
    expect(params.task.childContext.learningContext).toContain("Loves rockets");
    expect(params.narrationLanguage).toBe("English");
    expect(params.onViewGame).toBeUndefined();
  });

  it("edits a built game with its current state as the baseline", () => {
    const task = buildAgentTask(
      input({ game: { ...GAME, built: true, codeBundle: CODE }, screenshot: "data:image/png;base64,AA" }),
    );
    expect(task.taskType).toBe("update_game");
    expect(task.payload).toMatchObject({
      instruction: "a rocket counting game",
      existingCode: CODE,
      screenshot: "data:image/png;base64,AA",
      existingMeta: { title: "Space Math", tags: ["math"] },
    });
  });

  it("answers no_provider without running anything when no game model resolves", async () => {
    ports.execution.resolveGame = async () => null;
    const outcome = await runStudioBuild(input(), ports);
    expect(outcome).toEqual({ kind: "no_provider", transcript: [expect.objectContaining({ role: "user" })] });
    expect(agent).not.toHaveBeenCalled();
  });

  it("keeps the built game when persisting fails and reports the save", async () => {
    agent.mockResolvedValue(result());
    failPatch = true;
    const outcome = await runStudioBuild(input(), ports);
    expect(outcome).toMatchObject({ kind: "built", savedRow: null, saveError: "Bundle too large" });
    expect(ports.telemetry.reportError).toHaveBeenCalledWith(
      expect.objectContaining({ context: "game_save", secrets: [KEY] }),
    );
  });

  it("persists only the preview on a preview-only run", async () => {
    agent.mockResolvedValue(
      result({ previewOnly: true, previewImage: "data:image/jpeg;base64,UFJF", taskType: "update_game" }),
    );
    const outcome = await runStudioBuild(input({ game: { ...GAME, built: true } }), ports);
    expect(outcome).toMatchObject({ kind: "preview_only", previewImage: "data:image/jpeg;base64,UFJF" });
    expect(Object.keys(patches[0]).sort()).toEqual(["agent_transcript_enc", "path", "preview_image"]);
    expect(ports.games.patchLocal).toHaveBeenCalledWith("game-1", {
      preview_image: "data:image/jpeg;base64,UFJF",
    });
  });

  it("treats Stop as stopped, not failed, and drops the checkpoint", async () => {
    agent.mockImplementation(async (params) => {
      await params.onCheckpoint?.(AGENT_CHECKPOINT);
      throw new AgentAbortedError();
    });
    const outcome = await runStudioBuild(input(), ports);
    expect(outcome.kind).toBe("stopped");
    expect(ports.telemetry.reportError).not.toHaveBeenCalled();
    expect(ports.checkpoints.data.size).toBe(0);
  });

  it("keeps a sealed checkpoint when the connection drops mid-build", async () => {
    agent.mockImplementation(async (params) => {
      await params.onCheckpoint?.(AGENT_CHECKPOINT);
      throw new Error(`Connection error. key=${KEY}`);
    });
    const outcome = await runStudioBuild(input(), ports);

    expect(outcome).toMatchObject({ kind: "failed", isResumable: true });
    const sealed = ports.checkpoints.data.get("game-1")!;
    expect(sealed).toMatch(/^enc:v1:/);
    expect(sealed).not.toContain("rocket");
    expect(ports.telemetry.reportError).toHaveBeenCalledWith(
      expect.objectContaining({ context: "game_build", secrets: [KEY], meta: expect.objectContaining({ durationMs: 0 }) }),
    );
  });
});

describe("createBuildManager", () => {
  it("runs one build at a time and hands the outcome to the game's studio once", async () => {
    let finish: (r: AgentCodeResult) => void = () => {};
    agent.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    const manager = createBuildManager(ports);

    const first = manager.start(input());
    await vi.waitFor(() => expect(agent).toHaveBeenCalled());
    expect(manager.store.getState().active).toMatchObject({
      gameId: "game-1",
      transcript: [{ role: "user", text: "a rocket counting game" }],
    });
    expect(await manager.start(input({ gameId: "game-2" }))).toBeNull();

    finish(result());
    expect((await first)?.kind).toBe("built");
    expect(manager.store.getState().active).toBeNull();
    expect(manager.takeOutcome("game-1")?.kind).toBe("built");
    expect(manager.takeOutcome("game-1")).toBeNull();
  });

  it("streams live progress into the store", async () => {
    let finish: (r: AgentCodeResult) => void = () => {};
    agent.mockImplementation((params) => {
      params.onStep?.("writing_code");
      params.onActivity?.({ type: "narration_start" });
      params.onActivity?.({ type: "narration_delta", text: "Drawing " });
      params.onActivity?.({ type: "narration_delta", text: "rockets" });
      params.onActivity?.({ type: "write_progress", chars: 1234 });
      return new Promise((resolve) => (finish = resolve));
    });
    const manager = createBuildManager(ports);
    const run = manager.start(input());
    await vi.waitFor(() =>
      expect(manager.store.getState().active).toMatchObject({
        step: "writing_code",
        narration: "Drawing rockets",
        writeChars: 1200,
      }),
    );
    finish(result());
    await run;
  });

  it("pauses with its checkpoint kept, then resumes it to completion", async () => {
    const manager = createBuildManager(ports);
    agent.mockImplementation(
      (params) =>
        new Promise((_resolve, reject) => {
          void params.onCheckpoint?.(AGENT_CHECKPOINT).then(() => {
            params.signal?.addEventListener("abort", () => reject(new AgentAbortedError()));
            manager.pause();
          });
        }),
    );
    const paused = await manager.start(input());
    expect(paused?.kind).toBe("paused");
    expect(await manager.findResumable("game-1")).toEqual({
      gameId: "game-1",
      text: "a rocket counting game",
      savedAt: 1_000,
    });

    agent.mockReset();
    agent.mockResolvedValue(result());
    const resumed = await manager.resume("game-1", TEXTS);
    expect(resumed?.kind).toBe("built");
    const params = agent.mock.calls[0][0] as RunGameAgentParams;
    expect(params.resumeFrom).toEqual(AGENT_CHECKPOINT);
    expect(ports.checkpoints.data.size).toBe(0);
    expect(await manager.findResumable("game-1")).toBeNull();
  });

  it("will not continue a transcript with a different provider", async () => {
    agent.mockImplementation(async (params) => {
      await params.onCheckpoint?.(AGENT_CHECKPOINT);
      throw new Error("Connection error.");
    });
    const manager = createBuildManager(ports);
    await manager.start(input());

    ports.execution.resolveGame = async () => ({ provider: "xai", model: "grok", apiKey: "xai-k" });
    agent.mockReset();
    const outcome = await manager.resume("game-1", TEXTS);
    expect(outcome).toMatchObject({ kind: "failed", isResumable: false });
    expect(agent).not.toHaveBeenCalled();
    expect(ports.checkpoints.data.size).toBe(0);
  });

  it("drops a checkpoint sealed under another vault", async () => {
    ports.checkpoints.data.set("game-1", new VaultSession(generateVaultMasterKey()).encryptJson({}));
    const manager = createBuildManager(ports);
    expect(await manager.findResumable("game-1")).toBeNull();
    expect(ports.checkpoints.data.size).toBe(0);
  });
});

import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";

import { generateVaultMasterKey } from "@dodi/crypto";
import { VaultSession } from "@dodi/vault";

vi.mock("@dodi/ai/game-plan-agent", () => ({ runPlanAgent: vi.fn() }));
vi.mock("@dodi/ai/plan-settings", () => ({ derivePlanSettings: vi.fn() }));

import { AgentAbortedError } from "@dodi/ai/game-agent";
import { runPlanAgent } from "@dodi/ai/game-plan-agent";
import { derivePlanSettings, type PlanSettings } from "@dodi/ai/plan-settings";

import { EMPTY_PLANNING, type PlanningState } from "./plan-state";
import type { EditorGameCache, StudioEditorPorts, StudioTelemetry } from "./ports";
import { emptyStudioGame, type StudioGame } from "./studio-game";
import {
  applyPlanSettings,
  createPlanningWriter,
  derivePlanSettingsForStudio,
  persistPlanning,
  type PlanTurnInput,
  runPlanTurn,
} from "./studio-plan";

const agent = vi.mocked(runPlanAgent);
const derive = vi.mocked(derivePlanSettings);

const KEY = "sk-ant-api03-secret-key";
const ENC = /^enc:v1:/;
const USAGE = { inputTokens: 10, outputTokens: 5, cacheWriteTokens: 0, cacheReadTokens: 0 };

let session: VaultSession;
let isUnlocked: boolean;
let calls: Array<{ path: string; method: string; body: Record<string, unknown> }>;
let ports: StudioEditorPorts & {
  telemetry: {
    reportUsage: Mock<StudioTelemetry["reportUsage"]>;
    reportError: Mock<StudioTelemetry["reportError"]>;
  };
  games: {
    put: Mock<EditorGameCache["put"]>;
    patchLocal: Mock<EditorGameCache["patchLocal"]>;
    invalidate: Mock<EditorGameCache["invalidate"]>;
  };
};

beforeEach(() => {
  agent.mockReset();
  derive.mockReset();
  session = new VaultSession(generateVaultMasterKey());
  isUnlocked = true;
  calls = [];
  ports = {
    api: {
      request: async (path, init) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        calls.push({ path, method: init?.method ?? "GET", body });
        if (path === "/api/games") return new Response(JSON.stringify({ id: "game-new" }));
        return new Response(JSON.stringify({ id: "game-1", ...body }));
      },
    },
    session: async () => session,
    currentSession: () => (isUnlocked ? session : null),
    execution: {
      resolveGame: async () => ({ provider: "anthropic", model: "claude-test", apiKey: KEY }),
      resolveImage: async () => null,
    },
    telemetry: {
      reportUsage: vi.fn<StudioTelemetry["reportUsage"]>(),
      reportError: vi.fn<StudioTelemetry["reportError"]>(),
    },
    games: {
      put: vi.fn<EditorGameCache["put"]>(),
      patchLocal: vi.fn<EditorGameCache["patchLocal"]>(),
      invalidate: vi.fn<EditorGameCache["invalidate"]>(),
    },
    now: () => 1_000,
  };
});

const KIDS = [
  {
    id: "kid-1",
    name: "Mia",
    birthdate: null,
    memory: "Loves rockets",
    parent_notes: null,
    language: "de",
  },
];

const turn = (patch: Partial<PlanTurnInput> = {}): PlanTurnInput => ({
  text: "a counting game",
  attachments: [],
  history: [{ role: "user", text: "hi" }, { role: "assistant", text: "hello" }],
  currentPlan: null,
  kids: KIDS,
  primaryKidId: "kid-1",
  replyLocale: "en",
  gameId: () => "game-1",
  texts: {
    planProposedFallback: "Here's a plan.",
    planUpdatedNote: "(plan updated)",
    stopped: "Stopped.",
    planFailed: "Plan failed.",
    aiUnavailable: "dodi AI unavailable.",
  },
  ...patch,
});

describe("runPlanTurn when the provider account is out of funds (402)", () => {
  const outOfFunds = () =>
    Object.assign(new Error('402 "Insufficient USD or Diem balance to complete request."'), {
      status: 402,
    });

  it("tells the parent dodi AI is unavailable when it ran on a dodi AI key", async () => {
    ports.execution.resolveGame = async () => ({
      provider: "venice",
      model: "claude-opus-5-5",
      apiKey: KEY,
      isManaged: true,
    });
    agent.mockRejectedValue(outOfFunds());
    await expect(runPlanTurn(ports, turn())).resolves.toEqual({
      kind: "failed",
      reason: "ai_unavailable",
      reply: { role: "assistant", text: "dodi AI unavailable." },
    });
    expect(ports.telemetry.reportError).toHaveBeenCalled();
  });

  it("keeps the generic failure on the parent's own key (BYOK)", async () => {
    agent.mockRejectedValue(outOfFunds());
    await expect(runPlanTurn(ports, turn())).resolves.toMatchObject({
      kind: "failed",
      reason: "failed",
      reply: { text: "Plan failed." },
    });
  });
});

describe("runPlanTurn", () => {
  it("runs the plan agent with the device key and reports usage", async () => {
    agent.mockResolvedValue({ reply: "", plan: { summary: "Count rockets" }, usage: USAGE, turns: 1 });
    const outcome = await runPlanTurn(ports, turn({ attachments: ["data:image/png;base64,AA=="] }));

    expect(outcome).toEqual({
      kind: "replied",
      plan: "Count rockets",
      reply: { role: "assistant", text: "Here's a plan.\n\n(plan updated)" },
    });
    const params = agent.mock.calls[0][0];
    expect(params).toMatchObject({
      provider: "anthropic",
      apiKey: KEY,
      model: "claude-test",
      currentPlan: null,
      replyLanguage: "English",
      message: { text: "a counting game", images: ["data:image/png;base64,AA=="] },
    });
    expect(params.priorTurns).toEqual([
      { role: "user", text: "hi" },
      { role: "assistant", text: "hello" },
    ]);
    // The whole family's learning context, assembled on the device.
    expect(params.childContext.learningContext).toContain("Loves rockets");
    expect(ports.telemetry.reportUsage).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "game_plan", gameId: "game-1", kidId: "kid-1" }),
    );
  });

  it("returns no reply when the model said nothing and proposed nothing", async () => {
    agent.mockResolvedValue({ reply: "  ", plan: null, usage: USAGE, turns: 1 });
    await expect(runPlanTurn(ports, turn())).resolves.toEqual({
      kind: "replied",
      plan: null,
      reply: null,
    });
  });

  it("does nothing without a game model", async () => {
    ports.execution.resolveGame = async () => null;
    await expect(runPlanTurn(ports, turn())).resolves.toEqual({ kind: "no_provider" });
    expect(agent).not.toHaveBeenCalled();
  });

  it("tells a stop from a failure", async () => {
    agent.mockRejectedValue(new AgentAbortedError());
    await expect(runPlanTurn(ports, turn())).resolves.toEqual({
      kind: "stopped",
      reply: { role: "assistant", text: "Stopped." },
    });
    expect(ports.telemetry.reportError).not.toHaveBeenCalled();

    agent.mockRejectedValue(new Error(`401 bad key ${KEY}`));
    await expect(runPlanTurn(ports, turn())).resolves.toEqual({
      kind: "failed",
      reason: "failed",
      reply: { role: "assistant", text: "Plan failed." },
    });
    expect(ports.telemetry.reportError).toHaveBeenCalledWith(
      expect.objectContaining({
        context: "game_plan",
        provider: "anthropic",
        model: "claude-test",
        secrets: [KEY],
        meta: { durationMs: 0 },
      }),
    );
  });
});

describe("accepting a plan", () => {
  const SETTINGS: PlanSettings = {
    title: "Rocket Count",
    learningGoal: "Count to 10",
    successDefinition: "",
    tags: ["numbers"],
    targetAgeMin: 4,
    targetAgeMax: 6,
    perspective: "side",
  };

  it("derives the settings with the device key", async () => {
    derive.mockResolvedValue(SETTINGS);
    const settings = await derivePlanSettingsForStudio(ports, {
      planText: "Count rockets",
      kids: KIDS,
      primaryKidId: "kid-1",
      locale: "de",
      defaultAgeMin: 4,
      defaultAgeMax: 12,
      gameId: () => "game-1",
    });
    expect(settings).toBe(SETTINGS);
    expect(derive.mock.calls[0][0]).toEqual({
      providerId: "anthropic",
      modelId: "claude-test",
      apiKey: KEY,
    });
    expect(derive.mock.calls[0][2]).toMatchObject({ language: "German", defaultAgeMax: 12 });
  });

  it("derives nothing without a game model", async () => {
    ports.execution.resolveGame = async () => null;
    const settings = await derivePlanSettingsForStudio(ports, {
      planText: "Count rockets",
      kids: KIDS,
      primaryKidId: "kid-1",
      locale: "en",
      defaultAgeMin: 4,
      defaultAgeMax: 12,
      gameId: () => null,
    });
    expect(settings).toBeNull();
  });

  it("fills the form, keeping a title the parent typed", () => {
    const base: StudioGame = { ...emptyStudioGame(), learningGoal: "old goal", successDefinition: "old" };
    expect(applyPlanSettings(base, SETTINGS)).toMatchObject({
      title: "Rocket Count",
      learningGoal: "Count to 10",
      successDefinition: "old",
      tags: ["numbers"],
      targetAgeMin: 4,
      targetAgeMax: 6,
      perspective: "side",
    });
    expect(applyPlanSettings({ ...base, title: "Mine" }, SETTINGS).title).toBe("Mine");
  });
});

describe("persistPlanning", () => {
  const planning: PlanningState = { ...EMPTY_PLANNING, summary: "Count rockets" };
  const game: StudioGame = { ...emptyStudioGame(), title: "Rocket Count", learningGoal: "Count" };
  const transcript = [{ role: "user" as const, text: "a rocket game" }];

  it("creates the row on the first write, sealed and inactive", async () => {
    const result = await persistPlanning(ports, {
      gameId: null,
      game,
      kidId: "kid-1",
      planning,
      transcript,
    });
    expect(result).toEqual({ kind: "created", gameId: "game-new" });
    const body = calls[0].body;
    expect(calls[0]).toMatchObject({ path: "/api/games", method: "POST" });
    for (const field of ["title", "codeBundle", "agentTranscriptEnc", "planEnc"]) {
      expect(String(body[field])).toMatch(ENC);
    }
    expect(session.decryptJson(String(body.planEnc))).toEqual(planning);
    expect(JSON.stringify(body)).not.toContain("rocket");
    expect(body).toMatchObject({ kidId: "kid-1", isActive: false });
    expect(ports.games.invalidate).toHaveBeenCalled();
  });

  it("patches the envelope; an accepted plan carries its sealed settings", async () => {
    const result = await persistPlanning(ports, {
      gameId: "game-1",
      game,
      kidId: "kid-1",
      planning: { ...planning, isAccepted: true },
      transcript,
    });
    expect(result.kind).toBe("updated");
    const body = calls[0].body;
    expect(calls[0]).toMatchObject({ path: "/api/games/game-1", method: "PATCH" });
    for (const field of ["title", "learning_goal", "agent_transcript_enc", "plan_enc"]) {
      expect(String(body[field])).toMatch(ENC);
    }
    expect(body).toMatchObject({ target_age_min: 4, target_age_max: 12, metadata: { perspective: null } });
    expect(JSON.stringify(body)).not.toContain("Rocket Count");
    expect(ports.games.put).toHaveBeenCalled();
  });

  it("sends only the envelope while the plan is not accepted", async () => {
    await persistPlanning(ports, { gameId: "game-1", game, kidId: "kid-1", planning, transcript });
    expect(Object.keys(calls[0].body).sort()).toEqual(["agent_transcript_enc", "plan_enc"]);
  });

  it("stays on the device when locked or when no kid can own the row", async () => {
    isUnlocked = false;
    const input = { gameId: null, game, kidId: "kid-1", planning, transcript };
    await expect(persistPlanning(ports, input)).resolves.toEqual({ kind: "skipped" });
    isUnlocked = true;
    await expect(persistPlanning(ports, { ...input, kidId: null })).resolves.toEqual({
      kind: "skipped",
    });
    expect(calls).toHaveLength(0);
  });
});

describe("createPlanningWriter", () => {
  it("writes one at a time and again when something changed meanwhile", async () => {
    let release: () => void = () => {};
    let writes = 0;
    const writer = createPlanningWriter(
      () =>
        new Promise<void>((resolve) => {
          writes++;
          release = resolve;
        }),
      () => {},
    );
    writer.markDirty();
    const first = writer.flush();
    expect(writes).toBe(1);
    writer.markDirty();
    // A loop is already running: a second flush returns without writing.
    await writer.flush();
    expect(writes).toBe(1);
    release();
    await Promise.resolve();
    await Promise.resolve();
    expect(writes).toBe(2);
    release();
    await first;
    expect(writes).toBe(2);
    expect(writer.isDirty()).toBe(false);
  });

  it("reports a failed write and keeps going; discard drops a queued one", async () => {
    const errors: unknown[] = [];
    const persist = vi.fn<() => Promise<void>>().mockRejectedValueOnce(new Error("offline"));
    const writer = createPlanningWriter(persist, (err) => errors.push(err));
    writer.markDirty();
    await writer.flush();
    expect(errors).toHaveLength(1);

    writer.markDirty();
    writer.discard();
    await writer.flush();
    expect(persist).toHaveBeenCalledTimes(1);
    await expect(writer.settled()).resolves.toBeUndefined();
  });
});

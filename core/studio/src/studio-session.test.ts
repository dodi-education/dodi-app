import { beforeEach, describe, expect, it, vi } from "vitest";

import { generateVaultMasterKey } from "@dodi/crypto";
import { VaultSession } from "@dodi/vault";

vi.mock("@dodi/ai/game-plan-agent", () => ({ runPlanAgent: vi.fn() }));
vi.mock("@dodi/ai/plan-settings", () => ({ derivePlanSettings: vi.fn() }));
vi.mock("@dodi/ai/success-mapping", () => ({ mapSuccessDefinition: vi.fn() }));

import { runPlanAgent } from "@dodi/ai/game-plan-agent";
import { derivePlanSettings } from "@dodi/ai/plan-settings";
import { mapSuccessDefinition } from "@dodi/ai/success-mapping";
import { UNBUILT_GAME_PLACEHOLDER } from "@dodi/games/placeholder";

import type { StudioKid } from "./build-runner";
import { restorePlanning } from "./plan-state";
import {
  acceptPlan,
  lastBuildChecks,
  lastReply,
  loadStudioSessionTexts,
  openStudioGame,
  planTurn,
  prepareEdit,
  StudioSessionError,
  updateStudioSettings,
  type StudioSessionContext,
  type StudioSessionPorts,
} from "./studio-session";
import { restoreTranscript, type StudioChatMessage } from "./transcript";

/**
 * The studio's parent side without a screen (the dodi CLI's path): every step
 * reloads the row and writes it back, so a fresh process can carry on and the
 * parent later sees the same thread in the app.
 */

const agent = vi.mocked(runPlanAgent);
const derive = vi.mocked(derivePlanSettings);
const mapSuccess = vi.mocked(mapSuccessDefinition);
const USAGE = { inputTokens: 1, outputTokens: 1, cacheWriteTokens: 0, cacheReadTokens: 0 };

const KIDS: StudioKid[] = [
  { id: "kid-1", name: "Mia", birthdate: "2019-03-14", memory: "Loves dinosaurs.", parent_notes: null, language: "de" },
];

let session: VaultSession;
let rows: Map<string, Record<string, unknown>>;
let requests: Array<{ path: string; method: string; body: Record<string, unknown> }>;
let hasImageProvider: boolean;
let renderFrames: string[];

function baseRow(id: string): Record<string, unknown> {
  return {
    id,
    account_id: "acc-1",
    kid_id: "kid-1",
    title: "",
    description: "",
    code_bundle: UNBUILT_GAME_PLACEHOLDER,
    markdown: "",
    learning_goal: "",
    success_definition: "",
    success_criteria: null,
    preview_image: null,
    tags: [],
    progress_kind: "open",
    target_age_min: 4,
    target_age_max: 12,
    metadata: {},
    is_active: false,
    current_game_version_id: null,
    agent_transcript_enc: null,
    plan_enc: null,
  };
}

/** camelCase create body → row columns (only what the studio sends). */
function rowFromCreate(id: string, body: Record<string, unknown>): Record<string, unknown> {
  return {
    ...baseRow(id),
    kid_id: body.kidId,
    title: body.title ?? "",
    code_bundle: body.codeBundle,
    is_active: body.isActive ?? false,
    agent_transcript_enc: body.agentTranscriptEnc ?? null,
    plan_enc: body.planEnc ?? null,
  };
}

function makePorts(): StudioSessionPorts {
  return {
    api: {
      request: async (path, init) => {
        const method = init?.method ?? "GET";
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        requests.push({ path, method, body });
        if (path === "/api/ai/config") {
          return Response.json({ gameProvider: "anthropic", ...(hasImageProvider ? { imageProvider: "gemini" } : {}) });
        }
        if (path === "/api/games" && method === "POST") {
          const id = `game-${rows.size + 1}`;
          rows.set(id, rowFromCreate(id, body));
          return Response.json({ id });
        }
        const sharing = /^\/api\/games\/([^/]+)\/sharing$/.exec(path);
        if (sharing) return Response.json({ family: true, kidIds: [] });
        const one = /^\/api\/games\/([^/]+)$/.exec(path);
        if (one) {
          const row = rows.get(one[1]);
          if (!row) return Response.json({ error: "Game not found" }, { status: 404 });
          if (method === "PATCH") {
            const { audience: _audience, ...columns } = body;
            const merged = { ...row, ...columns, metadata: { ...(row.metadata as object), ...((columns.metadata as object) ?? {}) } };
            rows.set(one[1], merged);
            return Response.json(merged);
          }
          return Response.json(row);
        }
        throw new Error(`unexpected ${method} ${path}`);
      },
    },
    session: async () => session,
    currentSession: () => session,
    images: { downscale: async (url) => url, squareThumbnail: async (url) => url },
    execution: {
      resolveGame: async () => ({ provider: "anthropic", model: "claude-test", apiKey: "sk-test" }),
      resolveImage: async () => (hasImageProvider ? { provider: "gemini", model: "img", apiKey: "g-test" } : null),
    },
    screenshots: {
      forBuild: () =>
        renderFrames.length
          ? {
              viewGame: async () => ({
                frames: renderFrames.map((image, i) => ({ label: i ? `step ${i}` : "initial", image })),
                ready: true,
                warnings: [],
                errors: [],
              }),
              wasServiceUnavailable: () => false,
            }
          : null,
    },
    telemetry: { reportUsage: vi.fn(), reportError: vi.fn() },
    games: { put: vi.fn(), patchLocal: vi.fn(), invalidate: vi.fn() },
  };
}

async function context(): Promise<StudioSessionContext> {
  return { kids: KIDS, locale: "en", texts: await loadStudioSessionTexts("en") };
}

beforeEach(() => {
  agent.mockReset();
  derive.mockReset();
  mapSuccess.mockReset();
  session = new VaultSession(generateVaultMasterKey());
  rows = new Map();
  requests = [];
  hasImageProvider = true;
  renderFrames = [];
});

describe("planTurn", () => {
  it("creates the game row on the first turn, with the sealed thread and plan", async () => {
    agent.mockResolvedValue({
      reply: "What should the dinosaurs do?",
      plan: { summary: "A dino counting game." },
      usage: USAGE,
      turns: 1,
    } as never);
    const result = await planTurn(makePorts(), await context(), { gameId: null, text: "A dinosaur counting game" });

    expect(result.kind).toBe("replied");
    expect(result.gameId).toBe("game-1");
    expect(result.plan).toBe("A dino counting game.");
    const row = rows.get("game-1")!;
    expect(String(row.plan_enc)).toMatch(/^enc:v1:/);
    expect(String(row.agent_transcript_enc)).toMatch(/^enc:v1:/);
    const thread = restoreTranscript(session, row.agent_transcript_enc as string);
    expect(thread.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(thread[0].text).toBe("A dinosaur counting game");
    expect(restorePlanning(row.plan_enc as string, session)?.summary).toBe("A dino counting game.");
  });

  it("continues the same thread in a later turn (a fresh process)", async () => {
    agent.mockResolvedValueOnce({ reply: "Which numbers?", plan: null, usage: USAGE, turns: 1 } as never);
    const ports = makePorts();
    const first = await planTurn(ports, await context(), { gameId: null, text: "Counting game" });
    agent.mockResolvedValueOnce({ reply: "Got it.", plan: { summary: "Count 1 to 10." }, usage: USAGE, turns: 1 } as never);
    const second = await planTurn(makePorts(), await context(), { gameId: first.gameId, text: "1 to 10" });

    expect(second.gameId).toBe(first.gameId);
    expect(agent.mock.calls[1][0].priorTurns?.map((t: { text: string }) => t.text)).toEqual(["Counting game", "Which numbers?"]);
    const thread = restoreTranscript(session, rows.get("game-1")!.agent_transcript_enc as string);
    expect(thread).toHaveLength(4);
    expect(second.plan).toBe("Count 1 to 10.");
  });

  it("refuses a game that is past planning, and a family without kids", async () => {
    rows.set("built", { ...baseRow("built"), code_bundle: "<html>game</html>" });
    await expect(planTurn(makePorts(), await context(), { gameId: "built", text: "x" })).rejects.toThrow(
      StudioSessionError,
    );
    await expect(
      planTurn(makePorts(), { ...(await context()), kids: [] }, { gameId: null, text: "x" }),
    ).rejects.toThrow("no_kids");
  });
});

describe("acceptPlan", () => {
  async function plannedGame(): Promise<string> {
    agent.mockResolvedValue({ reply: "Here is a plan.", plan: { summary: "Count dinos 1 to 10." }, usage: USAGE, turns: 1 } as never);
    return (await planTurn(makePorts(), await context(), { gameId: null, text: "Dino counting" })).gameId!;
  }

  it("saves the derived settings, ends planning and returns the agreed build", async () => {
    const gameId = await plannedGame();
    derive.mockResolvedValue({
      title: "Dino Count",
      learningGoal: "Count to 10",
      successDefinition: "Counts 10 dinos",
      tags: ["math"],
      targetAgeMin: 4,
      targetAgeMax: 6,
      perspective: "side",
    } as never);

    const build = await acceptPlan(makePorts(), await context(), { gameId });

    const row = rows.get(gameId)!;
    expect(row.plan_enc).toBeNull();
    expect(row.metadata).toMatchObject({ perspective: "side", generateBackgroundImage: true, generatePreviewImage: true });
    expect(build.isAgreedPlan).toBe(true);
    expect(build.text).toBe("Build the game we planned:\n\nCount dinos 1 to 10.");
    expect(build.game.title).toBe("Dino Count");
    expect(build.game.generateBackgroundImage).toBe(true);
    expect(build.primaryKidId).toBe("kid-1");
    expect(build.history.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  it("leaves the pictures off without an image model and survives a failed derivation", async () => {
    const gameId = await plannedGame();
    hasImageProvider = false;
    derive.mockRejectedValue(new Error("model down"));
    const build = await acceptPlan(makePorts(), await context(), { gameId, planText: "My own plan\nwith details" });
    expect(build.game.generateBackgroundImage).toBe(false);
    expect(build.game.title).toBe("My own plan");
    expect(build.text).toContain("My own plan\nwith details");
  });

  it("refuses a game that is not being planned", async () => {
    rows.set("built", { ...baseRow("built"), code_bundle: "<html>game</html>" });
    await expect(acceptPlan(makePorts(), await context(), { gameId: "built" })).rejects.toThrow("not_planning");
  });
});

describe("prepareEdit", () => {
  it("carries the thread and a fresh screenshot of the built game", async () => {
    const thread: StudioChatMessage[] = [{ role: "user", text: "make it" }, { role: "assistant", text: "Done." }];
    rows.set("built", {
      ...baseRow("built"),
      code_bundle: session.encryptField("<html>game</html>"),
      agent_transcript_enc: session.encryptJson(thread),
    });
    renderFrames = ["data:image/jpeg;base64,AAAA"];
    const build = await prepareEdit(makePorts(), await context(), { gameId: "built", text: "bigger buttons" });
    expect(build.text).toBe("bigger buttons");
    expect(build.screenshot).toBe("data:image/jpeg;base64,AAAA");
    expect(build.game.built).toBe(true);
    expect(build.history).toEqual(thread);
    expect(build.isAgreedPlan).toBeUndefined();
  });

  it("asks to finish planning first", async () => {
    rows.set("planning", { ...baseRow("planning"), plan_enc: session.encryptJson({ summary: "x", isAccepted: false }) });
    await expect(prepareEdit(makePorts(), await context(), { gameId: "planning", text: "x" })).rejects.toThrow(
      "still_planning",
    );
  });
});

describe("updateStudioSettings", () => {
  /** A game the CLI 0.1.0 pushed by hand: built, no picture settings in its metadata. */
  function handWrittenGame(): void {
    rows.set("hand", {
      ...baseRow("hand"),
      title: session.encryptField("Dino Count"),
      learning_goal: session.encryptField("Count to 10"),
      success_definition: session.encryptField("Counts to 10 three times"),
      code_bundle: session.encryptField("<html>game</html>"),
      metadata: { capabilities: ["save_state"], createdWith: "dodi-cli" },
    });
  }

  it("switches the pictures on for a game that never had the setting, keeping its other metadata", async () => {
    handWrittenGame();
    const { game, successMapping } = await updateStudioSettings(makePorts(), "hand", {
      generatePreviewImage: true,
      generateBackgroundImage: true,
    });
    expect(game.generatePreviewImage).toBe(true);
    expect(game.generateBackgroundImage).toBe(true);
    expect(successMapping).toBe("unchanged");
    expect(mapSuccess).not.toHaveBeenCalled();
    expect(rows.get("hand")!.metadata).toMatchObject({
      generatePreviewImage: true,
      generateBackgroundImage: true,
      capabilities: ["save_state"],
      createdWith: "dodi-cli",
    });
    // Sealed as in the studio: the title never leaves the device in plaintext.
    expect(String(rows.get("hand")!.title)).toMatch(/^enc:v1:/);
  });

  it("refuses the pictures without an image model", async () => {
    handWrittenGame();
    hasImageProvider = false;
    await expect(updateStudioSettings(makePorts(), "hand", { generatePreviewImage: true })).rejects.toThrow(
      "no_image_provider",
    );
    expect(requests.some((r) => r.method === "PATCH")).toBe(false);
  });

  it("switches a picture off without asking for an image model", async () => {
    handWrittenGame();
    hasImageProvider = false;
    const { game } = await updateStudioSettings(makePorts(), "hand", { generatePreviewImage: false });
    expect(game.generatePreviewImage).toBe(false);
  });

  it("maps a changed success definition to criteria again, and keeps the old ones when that fails", async () => {
    handWrittenGame();
    const criteria = { description: "x", match: "all", conditions: [], requiredMetrics: [] };
    mapSuccess.mockResolvedValueOnce({ successCriteria: criteria, progressKind: "goal" } as never);
    const mapped = await updateStudioSettings(makePorts(), "hand", { successDefinition: "Counts to 20" });
    expect(mapped.successMapping).toBe("mapped");
    expect(mapped.game.successDefinition).toBe("Counts to 20");
    expect(rows.get("hand")!.progress_kind).toBe("goal");

    mapSuccess.mockRejectedValueOnce(new Error("model down"));
    const failed = await updateStudioSettings(makePorts(), "hand", { successDefinition: "Counts to 30" });
    expect(failed.successMapping).toBe("failed");
    expect(failed.game.successDefinition).toBe("Counts to 30");
  });

  it("saves ages, perspective and title, and refuses an empty title or a bad age range", async () => {
    handWrittenGame();
    const { game } = await updateStudioSettings(makePorts(), "hand", {
      title: "Dino Count 2",
      targetAgeMin: 5,
      targetAgeMax: 8,
      perspective: "side",
    });
    expect(game).toMatchObject({ title: "Dino Count 2", targetAgeMin: 5, targetAgeMax: 8, perspective: "side" });

    const refused = await updateStudioSettings(makePorts(), "hand", { title: " ", targetAgeMin: 9 }).catch((e) => e);
    expect(refused).toBeInstanceOf(StudioSessionError);
    expect(refused.code).toBe("invalid_settings");
    expect(refused.fields).toEqual(["title", "ages"]);
  });

  it("refuses a game that is still being planned", async () => {
    rows.set("planning", { ...baseRow("planning"), plan_enc: session.encryptJson({ summary: "x", isAccepted: false }) });
    await expect(updateStudioSettings(makePorts(), "planning", { title: "x" })).rejects.toThrow("still_planning");
  });
});

describe("reading the thread", () => {
  it("opens a missing game as not_found", async () => {
    await expect(openStudioGame(makePorts(), "nope")).rejects.toThrow("not_found");
  });

  it("finds dodi's last reply and the checks of the last build", () => {
    const check = {
      kind: "check" as const,
      atMs: 1,
      requestedSteps: [],
      hasFailed: false,
      isReady: true,
      frames: [{ label: "initial", image: "data:image/jpeg;base64,AA" }],
      errors: [],
      warnings: [],
      layoutIssues: [],
    };
    const thread: StudioChatMessage[] = [
      { role: "user", text: "make it" },
      { role: "assistant", text: "Built it.", run: { startedAt: 0, entries: [check] } },
    ];
    expect(lastReply(thread)?.text).toBe("Built it.");
    expect(lastBuildChecks(thread)).toEqual([check]);
    expect(lastBuildChecks([...thread, { role: "user", text: "more" }])).toEqual([]);
  });

  it("writes the replies in the parent's language", async () => {
    const de = await loadStudioSessionTexts("de");
    expect(de.planBuildIntro).not.toBe((await loadStudioSessionTexts("en")).planBuildIntro);
  });
});

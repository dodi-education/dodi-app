import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStore } from "zustand/vanilla";
import { openOwnSnapshotInfo, openOwnSnapshotPayload } from "@dodi/protocol";
import type { GameSaveState, GameToParentMessage } from "@dodi/types/games";
import type { Kid } from "@dodi/types/database";
import type { SuccessCriteria } from "@dodi/types/success";
import { VaultSession } from "@dodi/vault";

import { createConnectivityStore } from "./connectivity-store";
import type { GameStore, GameStoreState } from "./game-store";
import {
  AUTOSAVE_DEBOUNCE_MS,
  gamePlayPropsFromGame,
  gamePlayPropsFromSnapshot,
  openKidGame,
  type GamePlayHost,
  type GamePlayInfo,
  createGamePlaySession,
  playGoal,
} from "./game-play";
import type { KidStoreState, KidStore } from "./kid-store";
import { NO_SNAPSHOT_OFFLINE_CACHE, sealOwnSnapshot, buildSnapshotContent } from "./snapshots";
import type { VaultState, VaultStore } from "./vault-store";

const GAME_ID = "11111111-1111-4111-8111-111111111111";
const KID_ID = "22222222-2222-4222-8222-222222222222";
const PLAY_ID = "33333333-3333-4333-8333-333333333333";
const GOAL_CRITERIA: SuccessCriteria = {
  description: "Counted three",
  match: "all",
  conditions: [{ metric: "correct", op: ">=", value: 3 }],
  requiredMetrics: ["correct"],
};

interface Call {
  method: string;
  url: string;
  body: Record<string, unknown>;
}

function setup(overrides: Partial<GamePlayInfo> = {}) {
  const session = new VaultSession(new Uint8Array(32).fill(7));
  const vault = createStore(
    () => ({ session, status: "unlocked" }) as unknown as VaultState,
  ) as VaultStore;
  const kids = createStore(
    () => ({ loadOne: async () => ({ id: KID_ID }) as Kid }) as unknown as KidStoreState,
  ) as KidStore;

  const calls: Call[] = [];
  let respond: (call: Call) => { status: number; body?: unknown } = () => ({
    status: 200,
    body: { id: "snap-1", createdAt: "x" },
  });
  const api = {
    request: vi.fn(async (url: string, init?: RequestInit) => {
      const call: Call = {
        method: init?.method ?? "GET",
        url,
        body: init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : {},
      };
      calls.push(call);
      const { status, body } = respond(call);
      return {
        ok: status < 400,
        status,
        json: async () => body ?? {},
      } as Response;
    }),
  };

  const playSync = {
    startPlay: vi.fn(() => PLAY_ID),
    recordPlayPatch: vi.fn(),
    finalizePlay: vi.fn(),
    logGameEvent: vi.fn(),
  };
  const logActivity = vi.fn();

  const sandbox = { notifySuccess: vi.fn(), requestSaveState: vi.fn() };
  const host: GamePlayHost = {
    sandbox: () => sandbox,
    assistanceCount: () => 2,
    captureImage: vi.fn(async () => "data:image/png;base64,RAW"),
    thumbnail: vi.fn(async () => "data:image/jpeg;base64,THUMB"),
    unknownCommandError: () => "Unknown error",
    onGameError: vi.fn(),
    onGameTextRequest: vi.fn(),
    onGameVoiceRequest: vi.fn(),
  };

  const info: GamePlayInfo = {
    gameId: GAME_ID,
    kidId: KID_ID,
    title: "Counting",
    description: "Count things",
    codeBundle: "<html>game</html>",
    markdown: "# doc",
    capabilities: ["get_snapshot"],
    drawingStyle: "picture",
    goal: playGoal({
      progressKind: "goal",
      successCriteria: GOAL_CRITERIA,
      learningGoal: "count to 3",
      successDefinition: "Counted three",
    }),
    ...overrides,
  };

  const playSession = createGamePlaySession(
    {
      vault,
      kids,
      snapshots: {
        api,
        connectivity: createConnectivityStore(true),
        offline: NO_SNAPSHOT_OFFLINE_CACHE,
        friends: {
          ensureFriendKeys: vi.fn(),
          listFriends: vi.fn(async () => []),
        },
      },
      playSync,
      logActivity,
    },
    info,
    host,
  );

  /** Answer the pending save-state request like the sandbox would. */
  const answerSaveState = (state: GameSaveState): void =>
    playSession.handleMessage({
      type: "game:save_state",
      token: "t",
      payload: { state },
    } as unknown as GameToParentMessage);

  return {
    session,
    calls,
    setRespond: (fn: typeof respond) => {
      respond = fn;
    },
    playSync,
    logActivity,
    sandbox,
    host,
    playSession,
    answerSaveState,
  };
}

describe("playGoal", () => {
  it("only goal games with criteria get a goal", () => {
    const base = { learningGoal: "", successDefinition: "", successCriteria: GOAL_CRITERIA };
    expect(playGoal({ ...base, progressKind: "open" })).toBeUndefined();
    expect(playGoal({ ...base, progressKind: "goal", successCriteria: { ...GOAL_CRITERIA, conditions: [] } })).toBeUndefined();
    expect(playGoal({ ...base, progressKind: "goal" })?.progressKind).toBe("goal");
  });
});

describe("play tracking + success", () => {
  it("starts a play, records success once and finalizes with merged metrics", () => {
    const { playSession, playSync, sandbox } = setup();
    const end = playSession.beginPlay();
    expect(playSync.startPlay).toHaveBeenCalledWith({ gameId: GAME_ID, kidId: KID_ID });

    playSession.handleProgress({ progress: 0.5, metrics: { correct: 1 } });
    expect(sandbox.notifySuccess).not.toHaveBeenCalled();

    playSession.handleProgress({ progress: 1, metrics: { correct: 3 } });
    expect(sandbox.notifySuccess).toHaveBeenCalledTimes(1);
    expect(sandbox.notifySuccess.mock.calls[0][0]).toMatchObject({ summary: "Counted three" });
    expect(playSync.recordPlayPatch).toHaveBeenCalledWith(PLAY_ID, {
      succeeded: true,
      finalProgress: 1,
      metrics: expect.objectContaining({ correct: 3, hintsUsed: 2 }),
    });

    // Already succeeded: no second celebration.
    playSession.handleState({ dodi: { progress: 1, metrics: { correct: 4 } } });
    expect(sandbox.notifySuccess).toHaveBeenCalledTimes(1);

    end();
    expect(playSync.finalizePlay).toHaveBeenCalledWith(PLAY_ID, {
      finalProgress: 1,
      metrics: expect.objectContaining({ correct: 4, hintsUsed: 2 }),
    });
  });

  it("snapshot sessions record no play and log no events", () => {
    const { playSession, playSync } = setup({
      snapshot: { id: "s", savedState: {} as GameSaveState, gameId: null },
    });
    playSession.beginPlay()();
    playSession.logEvent("game_started", "x");
    expect(playSync.startPlay).not.toHaveBeenCalled();
    expect(playSync.finalizePlay).not.toHaveBeenCalled();
    expect(playSync.logGameEvent).not.toHaveBeenCalled();
  });
});

describe("message routing", () => {
  it("routes errors, results and capability-gated requests", () => {
    const { playSession, host, playSync } = setup({ capabilities: ["generate_text"] });
    const msg = (m: unknown) => playSession.handleMessage(m as GameToParentMessage);

    msg({ type: "game:error", token: "t", payload: { error: "boom" } });
    expect(host.onGameError).toHaveBeenLastCalledWith("boom");

    msg({
      type: "game:result",
      token: "t",
      payload: { command: { type: "clear" }, result: { ok: false } },
    });
    expect(host.onGameError).toHaveBeenLastCalledWith("Unknown error");
    expect(playSync.logGameEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({ event: "game_command_failed", message: "clear failed: Unknown error" }),
    );

    msg({ type: "game:event", token: "t", payload: { event: "request_generate_text", request: "animals" } });
    expect(host.onGameTextRequest).toHaveBeenCalledWith("animals");

    // Not declared: ignored.
    msg({ type: "game:event", token: "t", payload: { event: "request_generate_voice", text: "hi" } });
    expect(host.onGameVoiceRequest).not.toHaveBeenCalled();
  });
});

describe("autosave", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("debounces, seals the state and skips an unchanged upload", async () => {
    const { playSession, sandbox, calls, answerSaveState, session } = setup();
    playSession.handleState({});
    playSession.handleState({});
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    expect(sandbox.requestSaveState).toHaveBeenCalledTimes(1);

    answerSaveState({ level: 2 } as unknown as GameSaveState);
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    const put = calls[0];
    expect(put.method).toBe("PUT");
    expect(put.url).toBe("/api/snapshots/autosave");
    expect(Object.keys(put.body)).toEqual(["kidId", "gameId", "infoEnc", "payloadEnc", "payloadBytes"]);
    // Only ciphertext leaves the device.
    expect(JSON.stringify(put.body)).not.toContain("Counting");
    expect(openOwnSnapshotInfo(session, put.body.infoEnc as string).title).toBe("Autosave");
    expect(openOwnSnapshotPayload(session, put.body.payloadEnc as string).savedState).toEqual({
      level: 2,
    });

    // Same state again → no upload.
    playSession.handleState({});
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    answerSaveState({ level: 2 } as unknown as GameSaveState);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(1);
  });

  it("restores the slot and treats it as already uploaded", async () => {
    const { playSession, session, setRespond } = setup();
    const content = buildSnapshotContent(
      {
        gameId: GAME_ID,
        gameTitle: "Counting",
        gameDescription: "",
        gameMarkdown: "",
        codeBundle: "<html>game</html>",
        capabilities: [],
        drawingStyle: "picture",
      },
      "Autosave",
      { level: 5 } as unknown as GameSaveState,
      null,
    );
    setRespond(() => ({
      status: 200,
      body: {
        id: "a",
        origin: "autosave",
        gameId: GAME_ID,
        viewedAt: null,
        createdAt: "x",
        senderKidId: null,
        senderSignPublicKey: null,
        sharedWithKidId: null,
        ...sealOwnSnapshot(session, content),
      },
    }));
    await expect(playSession.loadAutosave(session)).resolves.toEqual({ level: 5 });

    setRespond(() => ({ status: 404, body: { error: "not found" } }));
    await expect(playSession.loadAutosave(session)).resolves.toBeUndefined();
  });
});

describe("saveSnapshot", () => {
  it("captures, flashes, seals and creates an own snapshot", async () => {
    const { playSession, calls, answerSaveState, session, logActivity, host } = setup();
    const onCaptured = vi.fn();
    const saving = playSession.saveSnapshot({ requestedTitle: "  My castle ", onCaptured });
    await vi.waitFor(() => expect(playSession.isSaveStatePending()).toBe(true));
    answerSaveState({ blocks: 3 } as unknown as GameSaveState);

    await expect(saving).resolves.toEqual({ title: "My castle" });
    expect(host.thumbnail).toHaveBeenCalledWith("data:image/png;base64,RAW");
    expect(onCaptured.mock.calls[0][0].rawSnapshot).toBe("data:image/png;base64,RAW");
    const post = calls[0];
    expect(post).toMatchObject({ method: "POST", url: "/api/snapshots" });
    expect(Object.keys(post.body)).toEqual(["kidId", "gameId", "infoEnc", "payloadEnc", "payloadBytes"]);
    const info = openOwnSnapshotInfo(session, post.body.infoEnc as string);
    expect(info).toMatchObject({ title: "My castle", gameTitle: "Counting", thumbnail: "data:image/jpeg;base64,THUMB" });
    expect(logActivity).toHaveBeenCalledWith({
      kidId: KID_ID,
      event: "snapshot_created",
      message: "Snapshot saved: My castle",
    });
  });

  it("rejects when the game never answers", async () => {
    vi.useFakeTimers();
    try {
      const { playSession } = setup();
      const saving = playSession.saveSnapshot();
      const assertion = expect(saving).rejects.toThrow("no_save_state");
      await vi.advanceTimersByTimeAsync(5000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("opening a game", () => {
  const gamesWith = (loadOne: () => Promise<unknown>) =>
    createStore(() => ({ loadOne }) as unknown as GameStoreState) as GameStore;

  it("tells a missing game from one not saved for offline", async () => {
    const online = createConnectivityStore(true);
    const offline = createConnectivityStore(false);
    const game = { id: GAME_ID } as Kid as never;
    await expect(openKidGame({ games: gamesWith(async () => game), connectivity: online }, GAME_ID, KID_ID)).resolves.toEqual({ kind: "ok", game });
    await expect(openKidGame({ games: gamesWith(async () => null), connectivity: online }, GAME_ID, KID_ID)).resolves.toEqual({ kind: "missing" });
    await expect(
      openKidGame({ games: gamesWith(() => Promise.reject(new Error("x"))), connectivity: offline }, GAME_ID, KID_ID),
    ).resolves.toEqual({ kind: "offline-unavailable" });
  });

  it("maps rows and snapshots to play props", () => {
    const props = gamePlayPropsFromGame({
      id: GAME_ID,
      title: "T",
      description: "D",
      code_bundle: "<html></html>",
      markdown: "",
      learning_goal: "L",
      success_definition: "S",
      success_criteria: GOAL_CRITERIA,
      progress_kind: "goal",
      metadata: { capabilities: ["get_snapshot"], drawingStyle: "coloring" },
    } as never);
    expect(props).toMatchObject({ progressKind: "goal", capabilities: ["get_snapshot"], drawingStyle: "coloring" });

    const snap = gamePlayPropsFromSnapshot("snap-1", {
      sanitizedCode: "<clean/>",
      payload: {
        v: 1,
        title: "My save",
        createdAt: "x",
        gameId: null,
        gameTitle: "Castle",
        gameDescription: "Build",
        gameMarkdown: "",
        codeBundle: "<dirty/>",
        capabilities: [],
        drawingStyle: "picture",
        savedState: { a: 1 } as unknown as GameSaveState,
      },
    });
    expect(snap).toMatchObject({
      gameId: "snap-1",
      title: "My save",
      codeBundle: "<clean/>",
      progressKind: "open",
      snapshot: { id: "snap-1", gameId: null },
      inlineContext: { title: "Castle", description: "Build" },
    });
  });
});

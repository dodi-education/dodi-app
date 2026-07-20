import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Coverage for the dodi session store's transcript wiring: rounds are coalesced
 * (one entry per speaker run, not per streamed word chunk) and recorded through
 * the transcript-sync module (mocked here — its persistence behavior is pinned
 * in transcript-sync.test.ts), and connect/processMemoryNow drive the
 * seed→flush→memory-update chain with a single-flight guard.
 *
 * Runs in the node test env, so all browser-coupled imports of the store are
 * mocked, and `localStorage` / `window` / `document` are stubbed manually.
 */

const {
  runClientMemoryUpdate,
  beginDaySpy,
  recordRoundSpy,
  syncAndSeedSpy,
  flushNowSpy,
  liveHandler,
  sendToolResponseSpy,
  sendContextSpy,
  streamerStopSpy,
  dodiRequestSpy,
  resolveThinkingSpy,
  analyzeSpy,
  kidLoadOneSpy,
  kidPatchLocalSpy,
  kidById,
  tryResumeResult,
} = vi.hoisted(() => ({
  runClientMemoryUpdate: vi.fn(),
  beginDaySpy: vi.fn(),
  recordRoundSpy: vi.fn(),
  syncAndSeedSpy: vi.fn(),
  flushNowSpy: vi.fn(),
  liveHandler: { current: null as ((e: unknown) => void) | null },
  sendToolResponseSpy: vi.fn(),
  sendContextSpy: vi.fn(),
  streamerStopSpy: vi.fn(),
  dodiRequestSpy: vi.fn(),
  resolveThinkingSpy: vi.fn(),
  analyzeSpy: vi.fn(),
  kidLoadOneSpy: vi.fn(),
  kidPatchLocalSpy: vi.fn(),
  kidById: { current: {} as Record<string, Record<string, unknown>> },
  // Controls whether the AudioStreamer resumes without a gesture. false ⇒ the
  // store lands in transient gesture-needed deaf (distinct from persisted deaf).
  tryResumeResult: { current: true },
}));

vi.mock("@/lib/api", () => ({ dodi: { request: dodiRequestSpy } }));
vi.mock("@/lib/ai/transcript-sync", () => ({
  beginDay: beginDaySpy,
  recordRound: recordRoundSpy,
  syncAndSeed: syncAndSeedSpy,
  flushNow: flushNowSpy,
}));
vi.mock("@/lib/ai/resolve-client-thinking", () => ({
  resolveClientThinking: resolveThinkingSpy,
}));

// Game-state analysis now runs fully in the browser (BYOK server-blindness).
vi.mock("@dodi/ai/game-analysis", () => ({ analyzeGameState: analyzeSpy }));
vi.mock("@/stores/kid-store", () => ({
  useKidStore: {
    getState: () => ({
      loadOne: kidLoadOneSpy,
      patchLocal: kidPatchLocalSpy,
      byId: kidById.current,
    }),
  },
}));

vi.mock("@/lib/ai/client-memory-update", () => ({ runClientMemoryUpdate }));

// The store resolves the voice client through the provider-neutral factory, so
// intercept that (not the concrete Gemini/xAI clients) and capture the handler.
vi.mock("@/lib/ai/create-voice-client", () => ({
  createVoiceClient: (_cfg: unknown, handler: (e: unknown) => void) => {
    liveHandler.current = handler;
    return {
      connect() {},
      disconnect() {},
      sendGreeting() {},
      sendAudio() {},
      sendText() {},
      sendContext(...args: unknown[]) {
        sendContextSpy(...args);
      },
      sendToolResponse(...args: unknown[]) {
        sendToolResponseSpy(...args);
      },
    };
  },
}));

vi.mock("@/lib/ai/audio-streamer", () => ({
  AudioStreamer: class {
    stop() {
      streamerStopSpy();
    }
    destroy() {}
    primeFromGesture() {}
    async tryResume() {
      return tryResumeResult.current;
    }
    addPcmChunk() {}
    backlogSeconds() {
      return 0;
    }
  },
}));

vi.mock("@/lib/ai/audio-recorder", () => ({
  AudioRecorder: class {
    stop() {}
    async startWithStream() {}
  },
}));

vi.mock("@/lib/ai/voice-session", () => ({
  buildHomeVoiceConfig: async () => ({
    provider: "gemini",
    apiKey: "k",
    model: "m",
    voiceName: "Puck",
    systemInstruction: "S",
    isBirthday: false,
  }),
  buildGameVoiceConfig: async () => ({
    provider: "gemini",
    apiKey: "k",
    model: "m",
    voiceName: "Puck",
    systemInstruction: "S",
    isBirthday: false,
  }),
}));

vi.mock("@/lib/ai/client-game-assistant", () => ({
  runGameTextAssistant: async () => ({ reply: "", commands: [] }),
}));

vi.mock("@dodi/games/command-markers", () => ({
  extractCommandMarkers: () => ({ commands: [] }),
}));

vi.mock("@dodi/games/debug", () => ({
  gameDebug: () => {},
  gameDebugWarn: () => {},
}));

import {
  useDodiSessionStore,
  selectDodiThinking,
  selectDodiActivityKind,
} from "@/stores/dodi-session-store";

// --- localStorage stub -----------------------------------------------------

function makeLocalStorage() {
  let store: Record<string, string> = {};
  return {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = String(v);
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      store = {};
    },
  };
}

const PID = "pid-1";
const DAY1 = "2026-06-18T12:00:00.000Z"; // local day 2026-06-18 (UTC test env)

const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

async function connect(pid: string) {
  // Reset connection state so the "already connecting" early-return doesn't
  // block a subsequent connect for the same kid in multi-day tests.
  useDodiSessionStore.setState({ state: "disconnected" });
  await useDodiSessionStore.getState().connect(pid);
  await flush();
}

function fire(event: unknown) {
  liveHandler.current?.(event);
}

// Shared per-test setup: stub browser globals, reset the store's module state and
// all mocks, and install fake timers. Used by every describe block below.
function installTestEnv() {
  (globalThis as unknown as { window: unknown }).window = {
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  (globalThis as unknown as { document: unknown }).document = {
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  (globalThis as unknown as { localStorage: unknown }).localStorage = makeLocalStorage();

  // Reset the store's module-level session state, then start from a clean
  // localStorage so prior tests don't leak.
  useDodiSessionStore.getState().endSession();
  (globalThis as unknown as { localStorage: unknown }).localStorage = makeLocalStorage();

  vi.useFakeTimers();
  vi.setSystemTime(new Date(DAY1));

  runClientMemoryUpdate.mockReset();
  runClientMemoryUpdate.mockResolvedValue(true);
  beginDaySpy.mockReset();
  recordRoundSpy.mockReset();
  syncAndSeedSpy.mockReset();
  syncAndSeedSpy.mockResolvedValue(undefined);
  flushNowSpy.mockReset();
  flushNowSpy.mockResolvedValue(undefined);
  sendToolResponseSpy.mockReset();
  sendContextSpy.mockReset();
  streamerStopSpy.mockReset();
  dodiRequestSpy.mockReset();
  dodiRequestSpy.mockResolvedValue({ ok: true, json: async () => ({}) });
  resolveThinkingSpy.mockReset();
  analyzeSpy.mockReset();
  // Kid cache: default kid has no persisted deaf state; patchLocal mirrors the
  // real store by merging into byId so the dedup in persistDeafenedState works.
  kidById.current = {};
  kidLoadOneSpy.mockReset();
  kidLoadOneSpy.mockResolvedValue({ display_name: "Ada", language: "en" });
  kidPatchLocalSpy.mockReset();
  kidPatchLocalSpy.mockImplementation(
    (id: string, patch: Record<string, unknown>) => {
      kidById.current[id] = { ...(kidById.current[id] ?? {}), ...patch };
    },
  );
  liveHandler.current = null;
  tryResumeResult.current = true;
  useDodiSessionStore.setState({ state: "disconnected", context: { type: "home" } });
}

describe("dodi session store — transcript sync wiring", () => {
  beforeEach(() => {
    installTestEnv();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("connect begins the day, seeds+flushes, then runs the memory update", async () => {
    await connect(PID);

    expect(beginDaySpy).toHaveBeenCalledWith(PID);
    expect(syncAndSeedSpy).toHaveBeenCalledWith(PID);
    expect(runClientMemoryUpdate).toHaveBeenCalledTimes(1);
    expect(runClientMemoryUpdate).toHaveBeenCalledWith(PID, {});
    // The memory update must only run AFTER the outbox flush, so it sees the
    // freshly flushed transcript rows.
    expect(syncAndSeedSpy.mock.invocationCallOrder[0]).toBeLessThan(
      runClientMemoryUpdate.mock.invocationCallOrder[0],
    );
  });

  it("queues a manual process-memory run behind an in-flight auto run instead of dropping it", async () => {
    // Regression: on a page load with ?process-memory=1 the auto-connect's
    // memory update is already in flight when the manual trigger fires; the
    // manual includeToday run must queue and still happen — never be dropped
    // (dropping it left today's transcript permanently open).
    let resolveAuto!: (v: boolean) => void;
    runClientMemoryUpdate.mockReturnValueOnce(
      new Promise<boolean>((r) => {
        resolveAuto = r;
      }),
    );

    await connect(PID); // auto run starts, hangs
    useDodiSessionStore.getState().processMemoryNow(PID); // manual trigger during the hang
    await flush();
    expect(runClientMemoryUpdate).toHaveBeenCalledTimes(1); // queued, not started

    resolveAuto(true);
    await flush();

    expect(runClientMemoryUpdate).toHaveBeenCalledTimes(2);
    expect(runClientMemoryUpdate.mock.calls[1]).toEqual([
      PID,
      { includeToday: true },
    ]);
  });

  it("coalesces overlapping auto runs (reconnect while one is in flight)", async () => {
    let resolveAuto!: (v: boolean) => void;
    runClientMemoryUpdate.mockReturnValueOnce(
      new Promise<boolean>((r) => {
        resolveAuto = r;
      }),
    );

    await connect(PID); // auto run #1 starts, hangs
    await connect(PID); // reconnect → auto run #2 must coalesce away
    expect(runClientMemoryUpdate).toHaveBeenCalledTimes(1);

    resolveAuto(true);
    await flush();
    expect(runClientMemoryUpdate).toHaveBeenCalledTimes(1); // still just the one
  });

  it("processMemoryNow flushes the round + outbox, then processes including today", async () => {
    await connect(PID);
    fire({ type: "setupComplete" });
    await flush();
    runClientMemoryUpdate.mockClear();

    // An in-progress kid round is finalized by the manual trigger.
    fire({ type: "inputTranscription", text: "Ich liebe Mangos" });
    useDodiSessionStore.getState().processMemoryNow(PID);
    await flush();

    expect(recordRoundSpy).toHaveBeenCalledWith(
      expect.objectContaining({ role: "kid", text: "Ich liebe Mangos" }),
    );
    expect(flushNowSpy).toHaveBeenCalledWith(PID);
    expect(runClientMemoryUpdate).toHaveBeenCalledTimes(1);
    expect(runClientMemoryUpdate).toHaveBeenCalledWith(PID, {
      includeToday: true,
    });
    expect(flushNowSpy.mock.invocationCallOrder[0]).toBeLessThan(
      runClientMemoryUpdate.mock.invocationCallOrder[0],
    );
  });

  it("endSession flushes the outbox but never processes memory", async () => {
    await connect(PID);
    runClientMemoryUpdate.mockClear();
    flushNowSpy.mockClear();

    useDodiSessionStore.getState().endSession();
    await flush();

    expect(flushNowSpy).toHaveBeenCalledWith(PID);
    expect(runClientMemoryUpdate).not.toHaveBeenCalled();
  });

  it("coalesces streaming fragments into one recorded round per speaker run", async () => {
    await connect(PID);
    fire({ type: "setupComplete" });
    await flush(); // tryResume → transitionToActive → greetingSent

    // Kid speaks in word chunks, then Dodi answers in many chunks.
    fire({ type: "inputTranscription", text: "Ich mag " });
    fire({ type: "inputTranscription", text: "gerne Mango." });
    fire({ type: "outputTranscription", text: "Mmmh, Mangos!" });
    fire({ type: "outputTranscription", text: " Superlecker!" });
    fire({ type: "outputTranscription", text: " Magst du sie?" });
    fire({ type: "turnComplete" });

    // One recorded round per speaker run — not one per streamed fragment.
    expect(recordRoundSpy).toHaveBeenCalledTimes(2);
    expect(recordRoundSpy.mock.calls[0][0]).toMatchObject({
      role: "kid",
      text: "Ich mag gerne Mango.",
    });
    expect(recordRoundSpy.mock.calls[1][0]).toMatchObject({
      role: "dodi",
      text: "Mmmh, Mangos! Superlecker! Magst du sie?",
    });
    // Round timestamps mark the round START, stamped when the speaker switched.
    expect(recordRoundSpy.mock.calls[0][0].occurredAt).toBe(DAY1);
  });
});

// ---------------------------------------------------------------------------
// Persisted deaf state: kids.deafened_dodi_at makes the "deaf" toggle durable.
// NULL ⇒ Dodi comes up listening; a timestamp ⇒ she comes up deaf directly on
// connect (no greeting, no audio resume) until the kid taps her awake, which
// clears it. The deliberate toggle (activate/deactivate) writes it through the
// kids API and patches the local cache.
// ---------------------------------------------------------------------------

describe("dodi session store — persisted deaf state", () => {
  beforeEach(() => {
    installTestEnv();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const state = () => useDodiSessionStore.getState();
  const findKidPatch = () =>
    dodiRequestSpy.mock.calls.find(
      (c) =>
        c[0] === `/api/kids/${PID}` &&
        (c[1] as { method?: string } | undefined)?.method === "PATCH",
    );
  const patchBody = (call: unknown[]) =>
    JSON.parse((call[1] as { body: string }).body) as {
      deafened_dodi_at: string | null;
    };

  it("comes up deaf directly on connect when deafened_dodi_at is set", async () => {
    kidLoadOneSpy.mockResolvedValue({
      display_name: "Ada",
      language: "en",
      deafened_dodi_at: DAY1,
    });

    await connect(PID);
    fire({ type: "setupComplete" });
    await flush();

    // Deaf, and NOT gesture-needed — an incidental page click can't wake her.
    expect(state().state).toBe("deaf");
    expect(state().gestureNeeded).toBe(false);
  });

  it("comes up active on connect when deafened_dodi_at is null", async () => {
    await connect(PID);
    fire({ type: "setupComplete" });
    await flush();

    expect(state().state).toBe("active");
  });

  it("deactivate persists a deafened_dodi_at timestamp and patches the cache", async () => {
    await connect(PID);
    fire({ type: "setupComplete" });
    await flush();
    expect(state().state).toBe("active");

    dodiRequestSpy.mockClear();
    state().deactivate();

    expect(state().state).toBe("deaf");
    const patch = findKidPatch();
    expect(patch).toBeTruthy();
    expect(patchBody(patch!).deafened_dodi_at).toBe(DAY1); // fake system clock
    expect(kidById.current[PID]?.deafened_dodi_at).toBe(DAY1); // local cache
  });

  it("activate clears deafened_dodi_at when waking from persisted deaf", async () => {
    kidById.current[PID] = { deafened_dodi_at: DAY1 };
    kidLoadOneSpy.mockResolvedValue({
      display_name: "Ada",
      language: "en",
      deafened_dodi_at: DAY1,
    });

    await connect(PID);
    fire({ type: "setupComplete" });
    await flush();
    expect(state().state).toBe("deaf");

    dodiRequestSpy.mockClear();
    await state().activate();
    await flush();

    expect(state().state).toBe("active");
    const patch = findKidPatch();
    expect(patch).toBeTruthy();
    expect(patchBody(patch!).deafened_dodi_at).toBeNull();
    expect(kidById.current[PID]?.deafened_dodi_at ?? null).toBeNull();
  });

  it("waking from transient gesture-needed deaf does not persist (null→null no-op)", async () => {
    // Audio couldn't resume without a gesture → transient deaf (gestureNeeded),
    // which is NOT the persisted mute. Waking from it must not spam a redundant
    // null→null write to the kid row.
    tryResumeResult.current = false;
    await connect(PID);
    fire({ type: "setupComplete" });
    await flush();
    expect(state().state).toBe("deaf");
    expect(state().gestureNeeded).toBe(true); // transient, distinct from persisted

    dodiRequestSpy.mockClear();
    await state().activate();
    await flush();

    expect(state().state).toBe("active");
    expect(findKidPatch()).toBeUndefined(); // value already null → no write
  });
});

// ---------------------------------------------------------------------------
// generate_drawing deferral: the voice tool response is held open until the
// client-side image lands, so the native-audio model stays silent (a pending
// function call yields no audio) instead of looping "a doggy coming right up!"
// through the whole generation window.
// ---------------------------------------------------------------------------

describe("dodi session store — generate_drawing deferral", () => {
  beforeEach(() => {
    installTestEnv();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function connectGame(pid: string) {
    useDodiSessionStore.setState({
      state: "disconnected",
      context: {
        type: "game",
        gameId: "g1",
        markdown: "",
        codeBundle: "",
        gameState: {},
        capabilities: ["generate_drawing", "set_drawing_color", "get_snapshot"],
      },
    });
    await useDodiSessionStore.getState().connect(pid);
    await flush();
    fire({ type: "setupComplete" });
    await flush();
  }

  // First-class generate_drawing tool call (subject is the direct tool arg).
  const drawCall = (id: string, subject: string) => ({
    type: "toolCall" as const,
    id,
    name: "generate_drawing",
    args: { subject },
  });

  it("holds the generate_drawing tool response until the drawing resolves", async () => {
    const runCommands = vi.fn();
    useDodiSessionStore.getState().setOnRunCommands(runCommands);
    await connectGame(PID);

    streamerStopSpy.mockClear(); // ignore stop() calls from connect/cleanup
    fire(drawCall("call-1", "dog"));

    // Generation kicked off, but the tool call is held open — no response yet, so
    // the model has nothing to speak over (stays silent while it generates).
    expect(runCommands).toHaveBeenCalledWith([
      { type: "generate_drawing", payload: { subject: "dog" } },
    ]);
    expect(sendToolResponseSpy).not.toHaveBeenCalled();
    // The queued (faster-than-realtime) ack audio is flushed so it can't keep
    // playing over the thinking animation while the picture generates.
    expect(streamerStopSpy).toHaveBeenCalledTimes(1);

    // Play view reports the picture is on the canvas → the held call is answered.
    useDodiSessionStore.getState().resolveClientCommand({ ok: true });

    expect(sendToolResponseSpy).toHaveBeenCalledTimes(1);
    const [id, name, response] = sendToolResponseSpy.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(id).toBe("call-1");
    expect(name).toBe("generate_drawing");
    expect(response).toMatchObject({ ok: true, status: "done" });
  });

  it("forwards a first-class bridge command and answers immediately", async () => {
    const runCommands = vi.fn();
    useDodiSessionStore.getState().setOnRunCommands(runCommands);
    await connectGame(PID);

    fire({
      type: "toolCall",
      id: "call-color",
      name: "set_drawing_color",
      args: { color: "#e53935" },
    });

    // Router forwards {type: toolName, payload: args} to the sandbox…
    expect(runCommands).toHaveBeenCalledWith([
      { type: "set_drawing_color", payload: { color: "#e53935" } },
    ]);
    // …and echoes the real tool name back to Gemini.
    expect(sendToolResponseSpy).toHaveBeenCalledTimes(1);
    expect(sendToolResponseSpy.mock.calls[0][1]).toBe("set_drawing_color");
    expect(sendToolResponseSpy.mock.calls[0][2]).toMatchObject({
      ok: true,
      command: "set_drawing_color",
    });
  });

  it("rejects an unknown tool name", async () => {
    useDodiSessionStore.getState().setOnRunCommands(vi.fn());
    await connectGame(PID);

    fire({ type: "toolCall", id: "call-x", name: "definitely_not_a_tool", args: {} });

    expect(sendToolResponseSpy).toHaveBeenCalledTimes(1);
    expect(sendToolResponseSpy.mock.calls[0][2]).toMatchObject({ ok: false });
  });

  it("answers with an error response when the drawing fails", async () => {
    useDodiSessionStore.getState().setOnRunCommands(vi.fn());
    await connectGame(PID);
    fire(drawCall("call-2", "cat"));
    expect(sendToolResponseSpy).not.toHaveBeenCalled();

    useDodiSessionStore
      .getState()
      .resolveClientCommand({ ok: false, error: "No image model configured" });

    expect(sendToolResponseSpy).toHaveBeenCalledTimes(1);
    const response = sendToolResponseSpy.mock.calls[0][2] as Record<string, unknown>;
    expect(response.ok).toBe(false);
    expect(String(response.error)).toContain("No image model configured");
  });

  it("times out a stuck generation so the voice turn can never hang open", async () => {
    useDodiSessionStore.getState().setOnRunCommands(vi.fn());
    await connectGame(PID);
    fire(drawCall("call-3", "fish"));
    expect(sendToolResponseSpy).not.toHaveBeenCalled();

    // Nobody ever resolves it → the safety timeout fires a fallback response.
    await vi.advanceTimersByTimeAsync(30000);
    expect(sendToolResponseSpy).toHaveBeenCalledTimes(1);
    expect(sendToolResponseSpy.mock.calls[0][2]).toMatchObject({ ok: false });

    // A late resolve after the timeout is a no-op (the call is already answered).
    useDodiSessionStore.getState().resolveClientCommand({ ok: true });
    expect(sendToolResponseSpy).toHaveBeenCalledTimes(1);
  });

  it("defers save_snapshot like generate_drawing and speaks the play view's message", async () => {
    const runCommands = vi.fn();
    useDodiSessionStore.getState().setOnRunCommands(runCommands);
    await connectGame(PID);

    fire({
      type: "toolCall",
      id: "call-s",
      name: "save_snapshot",
      args: { title: "My castle" },
    });

    // Forwarded to the play view interceptor, response held open.
    expect(runCommands).toHaveBeenCalledWith([
      { type: "save_snapshot", payload: { title: "My castle" } },
    ]);
    expect(sendToolResponseSpy).not.toHaveBeenCalled();

    useDodiSessionStore
      .getState()
      .resolveClientCommand({ ok: true, message: "Saved as My castle." });

    expect(sendToolResponseSpy).toHaveBeenCalledTimes(1);
    const [id, name, response] = sendToolResponseSpy.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(id).toBe("call-s");
    expect(name).toBe("save_snapshot");
    expect(response).toMatchObject({ ok: true, message: "Saved as My castle." });
  });

  it("read_game_state analyzes in-browser with the vault key (no server call) and returns it", async () => {
    useDodiSessionStore.getState().setOnRunCommands(vi.fn());
    resolveThinkingSpy.mockResolvedValue({
      provider: "gemini",
      model: "gemini-3.5-flash",
      apiKey: "vault-key",
    });
    analyzeSpy.mockResolvedValue({
      analysis: "You drew a lovely heart!",
      usage: { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 },
    });
    await connectGame(PID);

    fire({ type: "toolCall", id: "call-r", name: "read_game_state", args: { question: "What did I draw?" } });
    await flush();

    // The whole analysis runs client-side: the vault key goes straight to the
    // provider via analyzeGameState — it must NEVER reach our servers.
    expect(dodiRequestSpy.mock.calls.find((c) => c[0] === "/api/agent/sessions")).toBeUndefined();
    expect(analyzeSpy).toHaveBeenCalledTimes(1);
    expect(analyzeSpy.mock.calls[0][0]).toMatchObject({
      provider: "gemini",
      model: "gemini-3.5-flash",
      apiKey: "vault-key",
      question: "What did I draw?",
    });

    const toolResp = sendToolResponseSpy.mock.calls.find((c) => c[1] === "read_game_state");
    expect(toolResp![2]).toMatchObject({ ok: true, analysis: "You drew a lovely heart!" });
  });

  it("read_game_state fails gracefully (no analysis call) when no thinking model is configured", async () => {
    useDodiSessionStore.getState().setOnRunCommands(vi.fn());
    resolveThinkingSpy.mockResolvedValue(null);
    await connectGame(PID);

    fire({ type: "toolCall", id: "call-r2", name: "read_game_state", args: { question: "What is this?" } });
    await flush();

    expect(analyzeSpy).not.toHaveBeenCalled();
    const toolResp = sendToolResponseSpy.mock.calls.find((c) => c[1] === "read_game_state");
    expect(toolResp![2]).toMatchObject({ ok: false });
  });
});

// ---------------------------------------------------------------------------
// AI-activity tracking: a single ref-counted map (keyed by provider category)
// drives the companion's "thinking" avatar so ANY in-game AI call lights it up,
// not just image generation. Analysis and drawing both flip it through the same
// begin/endAiActivity primitive.
// ---------------------------------------------------------------------------

describe("dodi session store — AI activity (thinking) tracking", () => {
  beforeEach(() => {
    installTestEnv();
    useDodiSessionStore.setState({ aiActivity: { image: 0, thinking: 0 } });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const state = () => useDodiSessionStore.getState();

  it("ref-counts begin/end per category so overlapping calls don't clear early", () => {
    const { beginAiActivity, endAiActivity } = state();

    beginAiActivity("thinking");
    beginAiActivity("thinking");
    expect(state().aiActivity.thinking).toBe(2);
    expect(selectDodiThinking(state())).toBe(true);

    endAiActivity("thinking");
    expect(state().aiActivity.thinking).toBe(1);
    expect(selectDodiThinking(state())).toBe(true); // second call still in flight

    endAiActivity("thinking");
    expect(state().aiActivity.thinking).toBe(0);
    expect(selectDodiThinking(state())).toBe(false);
  });

  it("clamps an unbalanced end at zero (never negative)", () => {
    state().endAiActivity("image");
    expect(state().aiActivity.image).toBe(0);
    expect(selectDodiThinking(state())).toBe(false);
  });

  it("selectDodiActivityKind prioritizes image copy over thinking", () => {
    const { beginAiActivity } = state();
    expect(selectDodiActivityKind(state())).toBeNull();

    beginAiActivity("thinking");
    expect(selectDodiActivityKind(state())).toBe("thinking");

    beginAiActivity("image");
    expect(selectDodiActivityKind(state())).toBe("image"); // image wins when both active
  });

  it("shows the thinking state while read_game_state analysis is in flight, then clears it", async () => {
    useDodiSessionStore.getState().setOnRunCommands(vi.fn());
    resolveThinkingSpy.mockResolvedValue({
      provider: "gemini",
      model: "gemini-3.5-flash",
      apiKey: "vault-key",
    });
    let resolveAnalysis!: (v: { analysis: string; usage: unknown }) => void;
    analyzeSpy.mockReturnValueOnce(
      new Promise<{ analysis: string; usage: unknown }>((r) => {
        resolveAnalysis = r;
      }),
    );

    useDodiSessionStore.setState({
      state: "disconnected",
      context: {
        type: "game",
        gameId: "g1",
        markdown: "",
        codeBundle: "",
        gameState: {},
        capabilities: ["get_snapshot"],
      },
    });
    await useDodiSessionStore.getState().connect(PID);
    await flush();
    fire({ type: "setupComplete" });
    await flush();

    fire({ type: "toolCall", id: "call-a", name: "read_game_state", args: { question: "What did I draw?" } });
    await flush();

    // Provider call is parked → the companion is "thinking" the whole time.
    expect(selectDodiThinking(state())).toBe(true);
    expect(selectDodiActivityKind(state())).toBe("thinking");

    resolveAnalysis({ analysis: "You drew a heart!", usage: {} });
    await flush();

    // Analysis done → thinking state cleared even without any manual toggle.
    expect(selectDodiThinking(state())).toBe(false);
  });
});

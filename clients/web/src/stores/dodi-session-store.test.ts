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

interface MockVoiceClient {
  handler: (e: unknown) => void;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  sendGreeting: ReturnType<typeof vi.fn>;
  sendAudio: ReturnType<typeof vi.fn>;
  sendText: ReturnType<typeof vi.fn>;
  sendContext: ReturnType<typeof vi.fn>;
  sendToolResponse: ReturnType<typeof vi.fn>;
  updateSession: ReturnType<typeof vi.fn>;
}

const {
  runClientMemoryUpdate,
  beginDaySpy,
  recordRoundSpy,
  syncAndSeedSpy,
  flushNowSpy,
  liveHandler,
  createdClients,
  mockVoiceProvider,
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
  // Every client the factory made this test, in creation order. Pooled tests
  // (xai) get several per session; persistent tests (gemini) exactly one.
  createdClients: { current: [] as unknown[] },
  // Provider returned by the mocked config builders: "gemini" exercises the
  // persistent single-socket path, "xai" the warm-socket pool.
  mockVoiceProvider: { current: "gemini" },
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

// The store (and the warm-socket pool) resolve voice clients through the
// provider-neutral factory, so intercept that (not the concrete Gemini/xAI
// clients). Each call gets its OWN mock client with per-client spies, recorded
// in createdClients; liveHandler tracks the latest handler for the persistent
// single-socket tests.
vi.mock("@/lib/ai/create-voice-client", () => ({
  createVoiceClient: (_cfg: unknown, handler: (e: unknown) => void) => {
    const mockClient = {
      handler,
      connect: vi.fn(),
      disconnect: vi.fn(),
      sendGreeting: vi.fn(),
      sendAudio: vi.fn(),
      sendText: vi.fn(),
      sendContext: vi.fn((...args: unknown[]) => {
        sendContextSpy(...args);
      }),
      sendToolResponse: vi.fn((...args: unknown[]) => {
        sendToolResponseSpy(...args);
      }),
      updateSession: vi.fn(),
    };
    createdClients.current.push(mockClient);
    liveHandler.current = handler;
    return mockClient;
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
    provider: mockVoiceProvider.current,
    apiKey: "k",
    model: "m",
    voiceName: "Puck",
    systemInstruction: "S",
    isBirthday: false,
  }),
  buildGameVoiceConfig: async () => ({
    provider: mockVoiceProvider.current,
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
import { useConnectivityStore } from "@/stores/connectivity-store";

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
  createdClients.current = [];
  mockVoiceProvider.current = "gemini";
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
        capabilities: ["generate_drawing", "generate_text", "set_drawing_color", "get_snapshot"],
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

  it("holds the generate_text tool response until the content lands (defers like generate_drawing)", async () => {
    const runCommands = vi.fn();
    useDodiSessionStore.getState().setOnRunCommands(runCommands);
    await connectGame(PID);

    fire({
      type: "toolCall",
      id: "call-text",
      name: "generate_text",
      args: { request: "a story about dragons" },
    });

    // Routed to the play view as a client command; the tool response is held
    // open so the model stays silent through the generation window.
    expect(runCommands).toHaveBeenCalledWith([
      { type: "generate_text", payload: { request: "a story about dragons" } },
    ]);
    expect(sendToolResponseSpy).not.toHaveBeenCalled();

    // Play view reports the slots are filled → the held call is answered.
    useDodiSessionStore.getState().resolveClientCommand({
      ok: true,
      message: "The new text is now in the game.",
    });

    expect(sendToolResponseSpy).toHaveBeenCalledTimes(1);
    const [id, name, response] = sendToolResponseSpy.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(id).toBe("call-text");
    expect(name).toBe("generate_text");
    expect(response).toMatchObject({
      ok: true,
      status: "done",
      message: "The new text is now in the game.",
    });
  });

  it("forwards a first-class bridge command and defers the answer until the game's state event", async () => {
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
    // …and holds the response open until the command's state event lands, so
    // the model observes the outcome (score, correctness) in the response.
    expect(sendToolResponseSpy).not.toHaveBeenCalled();

    useDodiSessionStore.getState().updateGameState({ activeColor: "#e53935" });

    expect(sendToolResponseSpy).toHaveBeenCalledTimes(1);
    const [id, name, response] = sendToolResponseSpy.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(id).toBe("call-color");
    expect(name).toBe("set_drawing_color");
    expect(response).toMatchObject({ ok: true, state: { activeColor: "#e53935" } });
    // The state traveled in the tool response — never as a context push.
    expect(sendContextSpy).not.toHaveBeenCalled();
  });

  it("answers a bridge command with a plain ok when the game emits no state event", async () => {
    useDodiSessionStore.getState().setOnRunCommands(vi.fn());
    await connectGame(PID);

    fire({ type: "toolCall", id: "call-n", name: "next_task", args: {} });
    expect(sendToolResponseSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2000);
    expect(sendToolResponseSpy).toHaveBeenCalledTimes(1);
    expect(sendToolResponseSpy.mock.calls[0][1]).toBe("next_task");
    expect(sendToolResponseSpy.mock.calls[0][2]).toMatchObject({
      ok: true,
      command: "next_task",
    });

    // A state event arriving after the timeout must not double-answer.
    useDodiSessionStore.getState().updateGameState({ task: 2 });
    expect(sendToolResponseSpy).toHaveBeenCalledTimes(1);
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

  it("read_game_state answers instantly with the host-buffered current state (no AI call)", async () => {
    useDodiSessionStore.getState().setOnRunCommands(vi.fn());
    await connectGame(PID);

    // The game pushed a state change to the host in the meantime.
    useDodiSessionStore.getState().updateGameState({ score: 7 });

    fire({ type: "toolCall", id: "call-s", name: "read_game_state", args: {} });

    expect(resolveThinkingSpy).not.toHaveBeenCalled();
    expect(analyzeSpy).not.toHaveBeenCalled();
    const toolResp = sendToolResponseSpy.mock.calls.find((c) => c[1] === "read_game_state");
    expect(toolResp![2]).toMatchObject({ ok: true, state: { score: 7 } });
  });

  it("analyze_game_state analyzes in-browser with the vault key (no server call) and returns it", async () => {
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

    fire({ type: "toolCall", id: "call-r", name: "analyze_game_state", args: { question: "What did I draw?" } });
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

    const toolResp = sendToolResponseSpy.mock.calls.find((c) => c[1] === "analyze_game_state");
    expect(toolResp![2]).toMatchObject({ ok: true, analysis: "You drew a lovely heart!" });
  });

  it("analyze_game_state fails gracefully (no analysis call) when no thinking model is configured", async () => {
    useDodiSessionStore.getState().setOnRunCommands(vi.fn());
    resolveThinkingSpy.mockResolvedValue(null);
    await connectGame(PID);

    fire({ type: "toolCall", id: "call-r2", name: "analyze_game_state", args: { question: "What is this?" } });
    await flush();

    expect(analyzeSpy).not.toHaveBeenCalled();
    const toolResp = sendToolResponseSpy.mock.calls.find((c) => c[1] === "analyze_game_state");
    expect(toolResp![2]).toMatchObject({ ok: false });
  });
});

// ---------------------------------------------------------------------------
// speakGameVoiceText: game-initiated spoken feedback (request_generate_voice)
// injects a read-aloud turn into the LIVE session — and only into a live one:
// deaf/sleep/disconnected must return the stable "voice_unavailable" code so
// mute always means mute.
// ---------------------------------------------------------------------------

describe("dodi session store — speakGameVoiceText (request_generate_voice)", () => {
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
        capabilities: ["generate_voice"],
      },
    });
    await useDodiSessionStore.getState().connect(pid);
    await flush();
    fire({ type: "setupComplete" });
    await flush();
  }

  const activeClient = () => createdClients.current[0] as MockVoiceClient;

  it("submits a read-aloud turn to the live session and reports ok", async () => {
    await connectGame(PID);

    const result = useDodiSessionStore.getState().speakGameVoiceText("B like in Ball!");

    expect(result).toEqual({ ok: true });
    expect(activeClient().sendText).toHaveBeenCalledTimes(1);
    const turn = activeClient().sendText.mock.calls[0][0] as string;
    // The game text rides inside a read-aloud framing — quoted material, not
    // instructions — and arrives verbatim.
    expect(turn).toContain("B like in Ball!");
    expect(turn).toContain("exactly as written");
  });

  it("returns voice_unavailable while deaf (mute means mute) and sends nothing", async () => {
    await connectGame(PID);
    useDodiSessionStore.getState().deactivate();
    expect(useDodiSessionStore.getState().state).toBe("deaf");

    const result = useDodiSessionStore.getState().speakGameVoiceText("read me");

    expect(result).toEqual({ ok: false, error: "voice_unavailable" });
    expect(activeClient().sendText).not.toHaveBeenCalled();
  });

  it("returns voice_unavailable when no session exists at all", () => {
    const result = useDodiSessionStore.getState().speakGameVoiceText("read me");
    expect(result).toEqual({ ok: false, error: "voice_unavailable" });
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
    useDodiSessionStore.setState({ aiActivity: { image: 0, thinking: 0, writing: 0 } });
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

  it("shows the thinking state while analyze_game_state analysis is in flight, then clears it", async () => {
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

    fire({ type: "toolCall", id: "call-a", name: "analyze_game_state", args: { question: "What did I draw?" } });
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

// ---------------------------------------------------------------------------
// xAI warm-socket pool: xAI bills any socket that ever carried audio for its
// whole open lifetime (deaf included), so the pooled strategy keeps two warm
// never-audio standbys, closes the tainted active socket on deafen, and
// promotes a standby on (re)activation. Pinned here: the store-level wiring —
// pool lifecycle across connect/deactivate/activate/endSession, the persisted
// deaf $0 path, host-buffered game state, recap replay, fast recovery, and
// usage attribution. Pool internals live in voice-socket-pool.test.ts.
// ---------------------------------------------------------------------------

describe("dodi session store — xai warm-socket pool", () => {
  beforeEach(() => {
    installTestEnv();
    mockVoiceProvider.current = "xai";
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const state = () => useDodiSessionStore.getState();
  const clients = () => createdClients.current as MockVoiceClient[];

  // Pooled connect: the store awaits the pool's first ready standby, so the
  // handshake must be driven while connect() is in flight.
  async function connectPooled(pid: string) {
    useDodiSessionStore.setState({ state: "disconnected" });
    const connectPromise = useDodiSessionStore.getState().connect(pid);
    await flush(); // let the config build and the pool spawn its standbys
    for (const c of clients()) c.handler({ type: "setupComplete" });
    await connectPromise;
    await flush();
  }

  function expectWarmSilence(client: MockVoiceClient) {
    expect(client.sendGreeting).not.toHaveBeenCalled();
    expect(client.sendAudio).not.toHaveBeenCalled();
    expect(client.sendText).not.toHaveBeenCalled();
    expect(client.sendContext).not.toHaveBeenCalled();
  }

  it("connect warms the pipeline and activates on the head socket", async () => {
    await connectPooled(PID);

    expect(state().state).toBe("active");
    // The pipeline is 2 sockets TOTAL: the acquired active one + 1 warm standby.
    expect(clients()).toHaveLength(2);
    expect(clients()[0].sendGreeting).toHaveBeenCalledTimes(1);
    expectWarmSilence(clients()[1]);
  });

  it("deactivate closes the tainted active socket; its close never tears the session down", async () => {
    await connectPooled(PID);

    state().deactivate();

    expect(state().state).toBe("deaf");
    expect(clients()[0].disconnect).toHaveBeenCalledTimes(1);
    // The warm standbys stay open — they are free.
    expect(clients()[1].disconnect).not.toHaveBeenCalled();
    expect(clients()[2].disconnect).not.toHaveBeenCalled();

    // The retired socket's close event is pool-internal — the store must not
    // treat it as a session loss.
    clients()[0].handler({
      type: "closed",
      code: 1000,
      reason: "",
      fatal: false,
      message: "closed",
    });
    expect(state().state).toBe("deaf");
  });

  it("reactivation promotes the next warm standby instantly, without re-greeting", async () => {
    await connectPooled(PID);
    state().deactivate();

    await state().activate();
    await flush();

    expect(state().state).toBe("active");
    // The standby was already set up → no connecting dip on this path, and the
    // page-load greeting is not repeated on the fresh socket.
    expect(clients()[1].sendGreeting).not.toHaveBeenCalled();
    // Deafening had warmed a replacement secondary; acquiring spawns nothing.
    expect(clients()).toHaveLength(3);
  });

  it("persisted deaf never acquires a socket — the whole session stays $0", async () => {
    kidLoadOneSpy.mockResolvedValue({
      display_name: "Ada",
      language: "en",
      deafened_dodi_at: DAY1,
    });

    await connectPooled(PID);

    expect(state().state).toBe("deaf");
    expect(state().gestureNeeded).toBe(false);
    expect(clients()).toHaveLength(2); // warmed only, nothing acquired
    for (const c of clients()) {
      expectWarmSilence(c);
      expect(c.disconnect).not.toHaveBeenCalled();
    }
  });

  it("gesture-needed deaf acquires only once the kid's gesture activates", async () => {
    tryResumeResult.current = false;
    await connectPooled(PID);

    expect(state().state).toBe("deaf");
    expect(state().gestureNeeded).toBe(true);
    expect(clients()).toHaveLength(2);

    tryResumeResult.current = true;
    await state().activate();
    await flush();

    expect(state().state).toBe("active");
    expect(clients()).toHaveLength(2); // 1 active + 1 warm, nothing extra
  });

  it("rapid toggling dips to connecting when no standby is ready yet", async () => {
    await connectPooled(PID);

    state().deactivate(); // retires [0]; [1] ready, [2] connecting
    await state().activate(); // instant on [1]; replenishes [3]
    await flush();
    state().deactivate(); // retires [1]; [2]/[3] still connecting

    const activatePromise = state().activate();
    expect(state().state).toBe("connecting");

    clients()[2].handler({ type: "setupComplete" });
    await activatePromise;
    await flush();

    expect(state().state).toBe("active");
  });

  it("a fatal mint failure while connecting surfaces as a fatal disconnect", async () => {
    useDodiSessionStore.setState({ state: "disconnected" });
    const connectPromise = useDodiSessionStore.getState().connect(PID);
    await flush();

    clients()[0].handler({
      type: "closed",
      code: 0,
      reason: "ephemeral_token_auth",
      fatal: true,
      message: "bad key",
    });
    await connectPromise;
    await flush();

    expect(state().state).toBe("disconnected");
    expect(state().fatalError).toBe(true);
    expect(state().error).toBe("bad key");
  });

  it("endSession closes every socket the session ever created", async () => {
    await connectPooled(PID);

    state().endSession();

    for (const c of clients()) {
      expect(c.disconnect).toHaveBeenCalled();
    }
    expect(state().state).toBe("disconnected");
  });

  it("never pushes game state — changes while deaf stay host-buffered for read_game_state", async () => {
    useDodiSessionStore.setState({
      state: "disconnected",
      context: {
        type: "game",
        gameId: "g1",
        markdown: "",
        codeBundle: "",
        gameState: { score: 0 },
        capabilities: [],
      },
    });
    await connectPooled(PID);
    expect(state().state).toBe("active");
    sendContextSpy.mockClear();

    state().deactivate();
    // The game keeps running while Dodi is deaf — the store just buffers the
    // latest state on the host.
    state().updateGameState({ score: 5 });
    expect(sendContextSpy).not.toHaveBeenCalled();

    await state().activate();
    await flush();

    // No catch-up push on the promoted socket — state is never pushed at all…
    expect(
      sendContextSpy.mock.calls.filter((c) => String(c[0]).includes("[GAME STATE UPDATE")),
    ).toHaveLength(0);

    // …the model reads the host-buffered current state on demand instead.
    clients()[1].handler({ type: "toolCall", id: "call-r", name: "read_game_state", args: {} });
    const toolResp = sendToolResponseSpy.mock.calls.find((c) => c[1] === "read_game_state");
    expect(toolResp![2]).toMatchObject({ ok: true, state: { score: 5 } });
  });

  it("replays a conversation recap on the fresh socket after a deaf cycle", async () => {
    await connectPooled(PID);

    // A round of conversation on the first socket.
    clients()[0].handler({ type: "inputTranscription", text: "I love mangos" });
    clients()[0].handler({ type: "outputTranscription", text: "Mangos are great!" });
    clients()[0].handler({ type: "turnComplete" });

    state().deactivate();
    sendContextSpy.mockClear();
    await state().activate();
    await flush();

    const recaps = sendContextSpy.mock.calls.filter((c) =>
      String(c[0]).includes("[CONVERSATION SO FAR]"),
    );
    expect(recaps).toHaveLength(1);
    expect(String(recaps[0][0])).toContain("I love mangos");
    expect(String(recaps[0][0])).toContain("Mangos are great!");
    // The recap lands on the promoted socket, never a warm one.
    expect(clients()[1].sendContext).toHaveBeenCalledTimes(1);
  });

  it("recovers from an unexpected active-socket drop by promoting a standby", async () => {
    await connectPooled(PID);

    clients()[0].handler({
      type: "closed",
      code: 1006,
      reason: "",
      fatal: false,
      message: "Connection closed unexpectedly",
    });
    await flush();

    // Promoted, still in the conversation — no teardown, no re-greeting.
    expect(state().state).toBe("active");
    expect(clients()[0].disconnect).toHaveBeenCalled();
    expect(clients()[1].sendGreeting).not.toHaveBeenCalled();

    // A second drop right away is rate-limited → normal teardown path.
    clients()[1].handler({
      type: "closed",
      code: 1006,
      reason: "",
      fatal: false,
      message: "Connection closed unexpectedly",
    });
    await flush();
    expect(state().state).toBe("disconnected");
    expect(state().fatalError).toBe(false);
  });

  it("attributes voice minutes to the session's actual provider and model", async () => {
    await connectPooled(PID);
    expect(state().state).toBe("active");

    await vi.advanceTimersByTimeAsync(5000);
    state().deactivate();

    const usageCall = dodiRequestSpy.mock.calls.find((c) => c[0] === "/api/usage");
    expect(usageCall).toBeTruthy();
    const body = JSON.parse((usageCall![1] as { body: string }).body) as Record<
      string,
      unknown
    >;
    expect(body).toMatchObject({
      eventType: "voice_minutes",
      provider: "xai",
      model: "m",
      voiceSeconds: 5,
    });
  });
});

describe("dodi session store — offline guard", () => {
  beforeEach(() => {
    installTestEnv();
    useConnectivityStore.setState({ isOnline: false });
  });

  afterEach(() => {
    useConnectivityStore.setState({ isOnline: true });
    useDodiSessionStore.getState().endSession();
    vi.useRealTimers();
  });

  const state = () => useDodiSessionStore.getState();

  it("connect while offline stays disconnected without fatalError and opens nothing", async () => {
    await state().connect(PID);
    await flush();

    expect(state().state).toBe("disconnected");
    expect(state().error).toBeNull();
    expect(state().fatalError).toBe(false);
    expect(createdClients.current).toHaveLength(0);
    // The whole connect pipeline is skipped — no transcript day begins.
    expect(beginDaySpy).not.toHaveBeenCalled();
  });

  it("setContext while offline records the context but skips the reconnect", async () => {
    const gameContext = {
      type: "game" as const,
      gameId: "g1",
      markdown: "",
      codeBundle: "",
      gameState: {},
      capabilities: [],
    };
    await state().setContext(gameContext, PID);
    await flush();

    expect(state().context).toEqual(gameContext);
    expect(state().state).toBe("disconnected");
    expect(state().fatalError).toBe(false);
    expect(createdClients.current).toHaveLength(0);
  });

  it("connect works again once connectivity returns", async () => {
    await state().connect(PID);
    await flush();
    expect(state().state).toBe("disconnected");

    useConnectivityStore.setState({ isOnline: true });
    await connect(PID);
    expect(beginDaySpy).toHaveBeenCalled();
    expect(createdClients.current.length).toBeGreaterThan(0);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Coverage for the day-batched memory outbox in the dodi session store. Storage
 * is grouped per Dodi session (connect) and per ROUND (one coalesced entry per
 * speaker run, not per streamed word chunk): accumulate the day's sessions in
 * localStorage, promote a stale day into a pending outbox on the next connect,
 * drain it as one chunk to the thinking model, and clear it ONLY on a confirmed
 * write. Plus the manual `processMemoryNow` force-drain.
 *
 * Runs in the node test env, so all browser-coupled imports of the store are
 * mocked, and `localStorage` / `window` / `document` are stubbed manually.
 */

const {
  runClientMemoryUpdate,
  liveHandler,
  sendToolResponseSpy,
  sendContextSpy,
  streamerStopSpy,
  dodiRequestSpy,
  resolveThinkingSpy,
  analyzeSpy,
} = vi.hoisted(() => ({
  runClientMemoryUpdate: vi.fn(),
  liveHandler: { current: null as ((e: unknown) => void) | null },
  sendToolResponseSpy: vi.fn(),
  sendContextSpy: vi.fn(),
  streamerStopSpy: vi.fn(),
  dodiRequestSpy: vi.fn(),
  resolveThinkingSpy: vi.fn(),
  analyzeSpy: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ dodi: { request: dodiRequestSpy } }));
vi.mock("@/lib/ai/resolve-client-thinking", () => ({
  resolveClientThinking: resolveThinkingSpy,
}));

// Game-state analysis now runs fully in the browser (BYOK server-blindness).
vi.mock("@dodi/ai/game-analysis", () => ({ analyzeGameState: analyzeSpy }));
vi.mock("@/stores/kid-store", () => ({
  useKidStore: {
    getState: () => ({
      loadOne: async () => ({ display_name: "Ada", language: "en" }),
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
      return true;
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
const DAY2 = "2026-06-19T12:00:00.000Z";
const DAY3 = "2026-06-20T12:00:00.000Z";

interface Entry {
  role: "kid" | "dodi";
  text: string;
  timestamp: string;
}
interface Session {
  startedAt: string;
  entries: Entry[];
}

function makeSession(startedAt: string, ...texts: string[]): Session {
  return {
    startedAt,
    entries: texts.map((text, i) => ({
      role: i % 2 === 0 ? "kid" : "dodi",
      text,
      timestamp: DAY1,
    })),
  };
}

function totalEntries(sessions: Session[]): number {
  return sessions.reduce((n, s) => n + s.entries.length, 0);
}

const currentKey = (pid: string) => `dodi-transcript-${pid}`;
const pendingKey = (pid: string) => `dodi-memory-pending-${pid}`;

function seedCurrent(pid: string, date: string, sessions: Session[]) {
  localStorage.setItem(
    currentKey(pid),
    JSON.stringify({ kidId: pid, date, sessions }),
  );
}
function readCurrentRaw(pid: string) {
  const raw = localStorage.getItem(currentKey(pid));
  return raw ? JSON.parse(raw) : null;
}
function readPendingRaw(pid: string) {
  const raw = localStorage.getItem(pendingKey(pid));
  return raw ? JSON.parse(raw) : null;
}

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
  sendToolResponseSpy.mockReset();
  sendContextSpy.mockReset();
  streamerStopSpy.mockReset();
  dodiRequestSpy.mockReset();
  resolveThinkingSpy.mockReset();
  analyzeSpy.mockReset();
  liveHandler.current = null;
  useDodiSessionStore.setState({ state: "disconnected", context: { type: "home" } });
}

describe("dodi session store — day-batched memory outbox", () => {
  beforeEach(() => {
    installTestEnv();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("promotes a previous day's sessions into the outbox and drains them", async () => {
    seedCurrent(PID, "2026-06-18", [makeSession(DAY1, "hi", "hello", "more")]);
    vi.setSystemTime(new Date(DAY2));

    await connect(PID);

    expect(readCurrentRaw(PID)).toBeNull(); // promoted
    expect(runClientMemoryUpdate).toHaveBeenCalledTimes(1);
    const transcriptArg = runClientMemoryUpdate.mock.calls[0][1] as string;
    expect(transcriptArg).toContain("### Session");
    expect(transcriptArg).toContain("hi");
    expect(transcriptArg).toContain("more");
    expect(readPendingRaw(PID)).toBeNull(); // cleared on success
  });

  it("does NOT promote or drain a same-day batch (keeps accumulating)", async () => {
    seedCurrent(PID, "2026-06-18", [makeSession(DAY1, "a", "b")]);

    await connect(PID);

    expect(runClientMemoryUpdate).not.toHaveBeenCalled();
    expect(readPendingRaw(PID)).toBeNull();
    expect(totalEntries(readCurrentRaw(PID).sessions)).toBe(2);
  });

  it("loads today's sessions (processMemoryNow flushes them)", async () => {
    seedCurrent(PID, "2026-06-18", [makeSession(DAY1, "one", "two")]);
    await connect(PID);
    runClientMemoryUpdate.mockClear();

    useDodiSessionStore.getState().processMemoryNow(PID);
    await flush();

    expect(runClientMemoryUpdate).toHaveBeenCalledTimes(1);
    const arg = runClientMemoryUpdate.mock.calls[0][1] as string;
    expect(arg).toContain("one");
    expect(arg).toContain("two");
  });

  it("keeps pending data even if clearing the current key throws (crash-safe order)", async () => {
    seedCurrent(PID, "2026-06-18", [makeSession(DAY1, "x", "y", "z")]);
    vi.setSystemTime(new Date(DAY2));
    runClientMemoryUpdate.mockResolvedValue(false); // don't clear pending

    const ls = (globalThis as unknown as { localStorage: Storage }).localStorage;
    const origRemove = ls.removeItem.bind(ls);
    ls.removeItem = (k: string) => {
      if (k === currentKey(PID)) throw new Error("quota");
      origRemove(k);
    };

    await connect(PID);

    // Pending was written BEFORE the failed clear, so the data survives.
    expect(totalEntries(readPendingRaw(PID).sessions)).toBe(3);
    expect(readCurrentRaw(PID)).not.toBeNull(); // clear threw → still present
  });

  it("skips the drain below the minimum entry count, fires at/above it", async () => {
    seedCurrent(PID, "2026-06-18", [makeSession(DAY1, "only", "two")]);
    vi.setSystemTime(new Date(DAY2));
    await connect(PID);
    expect(runClientMemoryUpdate).not.toHaveBeenCalled();

    seedCurrent(PID, "2026-06-19", [makeSession(DAY2, "a", "b", "c")]);
    vi.setSystemTime(new Date(DAY3));
    await connect(PID);
    expect(runClientMemoryUpdate).toHaveBeenCalledTimes(1);
  });

  it("retains the outbox when the write fails, clears it when it succeeds", async () => {
    seedCurrent(PID, "2026-06-18", [makeSession(DAY1, "a", "b", "c")]);
    vi.setSystemTime(new Date(DAY2));
    runClientMemoryUpdate.mockResolvedValue(false);

    await connect(PID);
    expect(totalEntries(readPendingRaw(PID).sessions)).toBe(3); // retained

    runClientMemoryUpdate.mockResolvedValue(true);
    await connect(PID);
    expect(readPendingRaw(PID)).toBeNull();
  });

  it("guards against double-submitting the same pending batch", async () => {
    seedCurrent(PID, "2026-06-18", [makeSession(DAY1, "a", "b", "c")]);
    vi.setSystemTime(new Date(DAY2));

    let resolveDrain!: (v: boolean) => void;
    runClientMemoryUpdate.mockReturnValueOnce(
      new Promise<boolean>((r) => {
        resolveDrain = r;
      }),
    );

    await connect(PID); // drain #1 starts, hangs (guard held)
    useDodiSessionStore.getState().processMemoryNow(PID); // would drain again
    await flush();

    expect(runClientMemoryUpdate).toHaveBeenCalledTimes(1);

    resolveDrain(true); // release the guard for the next test
    await flush();
  });

  it("merges multiple unprocessed days into one pending batch", async () => {
    runClientMemoryUpdate.mockResolvedValue(false); // never clears

    seedCurrent(PID, "2026-06-18", [makeSession(DAY1, "d1a", "d1b", "d1c")]);
    vi.setSystemTime(new Date(DAY2));
    await connect(PID);
    expect(totalEntries(readPendingRaw(PID).sessions)).toBe(3);

    seedCurrent(PID, "2026-06-19", [makeSession(DAY2, "d2a", "d2b")]);
    vi.setSystemTime(new Date(DAY3));
    await connect(PID);

    const sessions = readPendingRaw(PID).sessions as Session[];
    expect(sessions).toHaveLength(2); // session structure preserved
    expect(totalEntries(sessions)).toBe(5);
    expect(sessions.flatMap((s) => s.entries.map((e) => e.text))).toEqual([
      "d1a",
      "d1b",
      "d1c",
      "d2a",
      "d2b",
    ]);
  });

  it("caps the pending outbox at MAX_PENDING_ENTRIES (drops oldest sessions)", async () => {
    runClientMemoryUpdate.mockResolvedValue(false);
    const MAX = 2000;
    // Many single-entry sessions totalling MAX.
    const big = Array.from({ length: MAX }, (_, i) => ({
      startedAt: DAY1,
      entries: [{ role: "kid" as const, text: `old-${i}`, timestamp: DAY1 }],
    }));
    localStorage.setItem(
      pendingKey(PID),
      JSON.stringify({ kidId: PID, sessions: big }),
    );
    seedCurrent(PID, "2026-06-18", [makeSession(DAY1, "new-1", "new-2", "new-3")]);
    vi.setSystemTime(new Date(DAY2));

    await connect(PID);

    const sessions = readPendingRaw(PID).sessions as Session[];
    expect(totalEntries(sessions)).toBe(MAX);
    const lastText = sessions[sessions.length - 1].entries.at(-1)!.text;
    expect(lastText).toBe("new-3"); // newest kept
    expect(sessions[0].entries[0].text).not.toBe("old-0"); // oldest dropped
  });

  it("processMemoryNow force-drains a below-threshold same-day batch", async () => {
    seedCurrent(PID, "2026-06-18", [makeSession(DAY1, "solo")]);
    await connect(PID);
    expect(runClientMemoryUpdate).not.toHaveBeenCalled(); // same day, not drained

    useDodiSessionStore.getState().processMemoryNow(PID);
    await flush();

    expect(runClientMemoryUpdate).toHaveBeenCalledTimes(1); // force bypasses min
    expect(readPendingRaw(PID)).toBeNull(); // cleared on success
    expect(readCurrentRaw(PID)).toBeNull();
  });

  it("endSession flushes the day sessions but never processes or clears them", async () => {
    seedCurrent(PID, "2026-06-18", [makeSession(DAY1, "a", "b", "c")]);
    await connect(PID);
    runClientMemoryUpdate.mockClear();

    useDodiSessionStore.getState().endSession();
    await flush();

    expect(runClientMemoryUpdate).not.toHaveBeenCalled();
    expect(totalEntries(readCurrentRaw(PID).sessions)).toBe(3);
  });

  it("coalesces streaming fragments into one entry per speaker round", async () => {
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

    const sessions = readCurrentRaw(PID).sessions as Session[];
    expect(sessions).toHaveLength(1); // one session (one connect)
    const entries = sessions[0].entries;
    expect(entries).toHaveLength(2); // one kid round, one Dodi round — not 5
    expect(entries[0]).toMatchObject({ role: "kid", text: "Ich mag gerne Mango." });
    expect(entries[1]).toMatchObject({
      role: "dodi",
      text: "Mmmh, Mangos! Superlecker! Magst du sie?",
    });
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

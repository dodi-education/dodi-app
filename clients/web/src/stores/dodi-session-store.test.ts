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

const { runClientMemoryUpdate, liveHandler } = vi.hoisted(() => ({
  runClientMemoryUpdate: vi.fn(),
  liveHandler: { current: null as ((e: unknown) => void) | null },
}));

vi.mock("@/lib/ai/client-memory-update", () => ({ runClientMemoryUpdate }));

vi.mock("@/lib/ai/gemini-live-client", () => ({
  GeminiLiveClient: class {
    constructor(_cfg: unknown, handler: (e: unknown) => void) {
      liveHandler.current = handler;
    }
    connect() {}
    disconnect() {}
    sendGreeting() {}
    sendAudio() {}
    sendContext() {}
    sendToolResponse() {}
  },
}));

vi.mock("@/lib/ai/audio-streamer", () => ({
  AudioStreamer: class {
    stop() {}
    destroy() {}
    primeFromGesture() {}
    async tryResume() {
      return true;
    }
    addPcmChunk() {}
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
    apiKey: "k",
    model: "m",
    voiceName: "Puck",
    systemInstruction: "S",
    isBirthday: false,
  }),
  buildGameVoiceConfig: async () => ({
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

vi.mock("@/lib/games/command-markers", () => ({
  extractCommandMarkers: () => ({ commands: [] }),
}));

vi.mock("@/lib/games/debug", () => ({
  gameDebug: () => {},
  gameDebugWarn: () => {},
}));

import { useDodiSessionStore } from "@/stores/dodi-session-store";

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
    JSON.stringify({ profileId: pid, date, sessions }),
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
  // block a subsequent connect for the same profile in multi-day tests.
  useDodiSessionStore.setState({ state: "disconnected" });
  await useDodiSessionStore.getState().connect(pid);
  await flush();
}

function fire(event: unknown) {
  liveHandler.current?.(event);
}

describe("dodi session store — day-batched memory outbox", () => {
  beforeEach(() => {
    (globalThis as unknown as { window: unknown }).window = {
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    (globalThis as unknown as { document: unknown }).document = {
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    (globalThis as unknown as { localStorage: unknown }).localStorage =
      makeLocalStorage();

    // Reset the store's module-level session state, then start from a clean
    // localStorage so prior tests don't leak.
    useDodiSessionStore.getState().endSession();
    (globalThis as unknown as { localStorage: unknown }).localStorage =
      makeLocalStorage();

    vi.useFakeTimers();
    vi.setSystemTime(new Date(DAY1));

    runClientMemoryUpdate.mockReset();
    runClientMemoryUpdate.mockResolvedValue(true);
    liveHandler.current = null;
    useDodiSessionStore.setState({ state: "disconnected", context: { type: "home" } });
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
      JSON.stringify({ profileId: PID, sessions: big }),
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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * End-to-end over the ports: the REAL Gemini Live client drives a fake socket
 * (the test plays the server), and a fake audio port records what the session
 * does with the microphone and the speaker. This is the contract a native
 * client implements: connect → mic chunks flow to the socket → server audio
 * reaches the speaker → barge-in flushes it → tool calls route to the game →
 * teardown releases everything; plus the error paths.
 */

import { createStore } from "zustand/vanilla";

import type { VoiceSessionConfig } from "@dodi/ai/voice/session-config";
import type { VoiceSocketHandlers, VoiceTransport } from "@dodi/ai/voice/voice-socket";

import { type AudioPort, MicrophoneError } from "./companion-audio";
import {
  type CompanionLifecycle,
  type CompanionSession,
  type CompanionStores,
  createCompanionSession,
} from "./companion-session";
import { createCompanionVolumeStore } from "./companion-volume-store";
import { createConnectivityStore } from "./connectivity-store";

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

interface FakeServer {
  url: string;
  handlers: VoiceSocketHandlers;
  sent: Array<Record<string, unknown>>;
  closed: boolean;
  /** Push one server frame. */
  push(frame: Record<string, unknown>): void;
}

function fakeTransport(): { transport: VoiceTransport; servers: FakeServer[] } {
  const servers: FakeServer[] = [];
  return {
    servers,
    transport: {
      socket: (url, _protocols, handlers) => {
        const server: FakeServer = {
          url,
          handlers,
          sent: [],
          closed: false,
          push: (frame) => handlers.onMessage(JSON.stringify(frame)),
        };
        servers.push(server);
        return {
          isOpen: () => !server.closed,
          send: (text) => server.sent.push(JSON.parse(text) as Record<string, unknown>),
          close: () => {
            server.closed = true;
          },
        };
      },
      fetch: vi.fn() as unknown as typeof fetch,
    },
  };
}

interface FakeAudio {
  port: AudioPort;
  mic: { onChunk: ((chunk: string) => void) | null; starts: number; stops: number };
  speaker: {
    enqueued: string[];
    stops: number;
    destroyed: number;
    volume: number | null;
    playbackEnd: (() => void) | null;
  };
  micError: { current: Error | null };
  /** Thrown by the speaker's tryResume (the native audio graph failing to start). */
  speakerError: { current: Error | null };
}

function fakeAudio(): FakeAudio {
  const mic: FakeAudio["mic"] = { onChunk: null, starts: 0, stops: 0 };
  const speaker: FakeAudio["speaker"] = {
    enqueued: [],
    stops: 0,
    destroyed: 0,
    volume: null,
    playbackEnd: null,
  };
  const micError: FakeAudio["micError"] = { current: null };
  const speakerError: FakeAudio["speakerError"] = { current: null };
  return {
    mic,
    speaker,
    micError,
    speakerError,
    port: {
      createRecorder: () => ({
        start: async (onChunk) => {
          if (micError.current) throw micError.current;
          mic.starts++;
          mic.onChunk = onChunk;
        },
        stop: () => {
          mic.stops++;
          mic.onChunk = null;
        },
      }),
      createSpeaker: () => ({
        enqueue: (chunk) => speaker.enqueued.push(chunk),
        stop: () => {
          speaker.stops++;
        },
        destroy: () => {
          speaker.destroyed++;
        },
        setVolume: (v) => {
          speaker.volume = v;
        },
        backlogSeconds: () => 0,
        onPlaybackEnd: (cb) => {
          speaker.playbackEnd = cb;
        },
        primeFromGesture: () => {},
        tryResume: async () => {
          if (speakerError.current) throw speakerError.current;
          return true;
        },
        outputLevel: () => 0.42,
      }),
    },
  };
}

const KID = "kid-1";
const GAME_CTX = {
  type: "game" as const,
  gameId: "g-1",
  markdown: "",
  codeBundle: "",
  gameState: { score: 0 },
  capabilities: [],
};

const flush = async (): Promise<void> => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

function makeStorage(): {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
} {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
    removeItem: (k) => {
      data.delete(k);
    },
  };
}

interface Harness {
  session: CompanionSession;
  servers: FakeServer[];
  audio: FakeAudio;
  request: ReturnType<typeof vi.fn>;
  recordRound: ReturnType<typeof vi.fn>;
  buildConfig: ReturnType<typeof vi.fn>;
  exitHandlers: Set<() => void>;
}

function setup(): Harness {
  const { transport, servers } = fakeTransport();
  const audio = fakeAudio();
  const request = vi.fn(async () => new Response("{}", { status: 200 }));
  const recordRound = vi.fn();
  const storage = makeStorage();
  const config: VoiceSessionConfig = {
    provider: "gemini",
    apiKey: "AIza-secret",
    model: "gemini-live-x",
    voiceName: "Puck",
    systemInstruction: "SYS",
  };
  const buildConfig = vi.fn(async () => config);
  const exitHandlers = new Set<() => void>();
  const lifecycle: CompanionLifecycle = {
    onExit: (handler) => {
      exitHandlers.add(handler);
      return () => exitHandlers.delete(handler);
    },
  };
  const kidById: Record<string, Record<string, unknown>> = {};
  const stores = {
    kids: {
      getState: () => ({
        byId: kidById,
        list: null,
        loadOne: async () => ({ id: KID, display_name: "Ada", language: "en" }),
        patchLocal: (id: string, patch: Record<string, unknown>) => {
          kidById[id] = { ...(kidById[id] ?? {}), ...patch };
        },
        invalidate: () => {},
      }),
      subscribe: createStore(() => ({})).subscribe,
    },
    games: { getState: () => ({ byKid: {}, loadForKid: async () => [] }) },
    vault: { getState: () => ({ session: null }) },
    connectivity: createConnectivityStore(true),
    companionVolume: createCompanionVolumeStore(storage),
    execution: { resolveThinking: async () => null, resolveExecution: async () => null },
  } as unknown as CompanionStores;

  const session = createCompanionSession({
    api: { request } as never,
    state: stores,
    audio: audio.port,
    storage,
    randomUUID: () => "uuid",
    transport,
    lifecycle,
    services: {
      transcripts: {
        beginDay: vi.fn(),
        recordRound,
        syncAndSeed: vi.fn(async () => {}),
        flushNow: vi.fn(async () => {}),
      },
      updateMemory: vi.fn(async () => true),
      buildHomeVoiceConfig: buildConfig,
      buildGameVoiceConfig: buildConfig,
    },
  });
  return { session, servers, audio, request, recordRound, buildConfig, exitHandlers };
}

/** Connect and complete the Gemini handshake; the session lands active. */
async function connectActive(h: Harness): Promise<FakeServer> {
  await h.session.store.getState().connect(KID);
  await flush();
  const server = h.servers[0];
  server.handlers.onOpen();
  server.push({ setupComplete: {} });
  await flush();
  return server;
}

const st = (h: Harness) => h.session.store.getState();

// ---------------------------------------------------------------------------

describe("companion session over fake ports", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-18T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("connects, greets and starts the microphone; mic chunks stream to the socket", async () => {
    const h = setup();
    const server = await connectActive(h);

    expect(st(h).state).toBe("active");
    expect(server.url).toContain("key=AIza-secret");
    expect(server.sent[0]).toHaveProperty("setup");
    // Greeting turn, then the recorder is live.
    expect(server.sent[1]).toMatchObject({ clientContent: { turnComplete: true } });
    expect(h.audio.mic.starts).toBe(1);

    h.audio.mic.onChunk?.("MIC-PCM");
    expect(server.sent.at(-1)).toEqual({
      realtimeInput: { audio: { mimeType: "audio/pcm;rate=16000", data: "MIC-PCM" } },
    });
    // The provider key is in the socket URL only, never in a frame.
    expect(JSON.stringify(server.sent)).not.toContain("AIza-secret");
  });

  it("plays server audio, and a barge-in flushes the speaker", async () => {
    const h = setup();
    const server = await connectActive(h);

    server.push({ serverContent: { modelTurn: { parts: [{ inlineData: { data: "VOICE-1" } }] } } });
    server.push({ serverContent: { modelTurn: { parts: [{ inlineData: { data: "VOICE-2" } }] } } });
    expect(h.audio.speaker.enqueued).toEqual(["VOICE-1", "VOICE-2"]);
    expect(st(h).dodiSpeaking).toBe(true);

    const stopsBefore = h.audio.speaker.stops;
    server.push({ serverContent: { interrupted: true } });
    expect(h.audio.speaker.stops).toBe(stopsBefore + 1);
    expect(st(h).dodiSpeaking).toBe(false);
  });

  it("stops speaking when the turn completes and the queue has played out", async () => {
    const h = setup();
    const server = await connectActive(h);
    server.push({ serverContent: { modelTurn: { parts: [{ inlineData: { data: "V" } }] } } });
    server.push({ serverContent: { outputTranscription: { text: "Hallo Ada!" } } });
    server.push({ serverContent: { turnComplete: true } });
    expect(st(h).dodiSpeaking).toBe(false);
    expect(h.recordRound).toHaveBeenCalledWith(
      expect.objectContaining({ role: "dodi", text: "Hallo Ada!" }),
    );
  });

  it("routes a bridge tool call to the game and answers with the next game state", async () => {
    const h = setup();
    h.session.store.setState({ context: GAME_CTX });
    const server = await connectActive(h);
    const runCommands = vi.fn();
    st(h).setOnRunCommands(runCommands);

    server.push({
      toolCall: { functionCalls: [{ id: "c1", name: "submit_answer", args: { answer: "4" } }] },
    });
    expect(runCommands).toHaveBeenCalledWith([{ type: "submit_answer", payload: { answer: "4" } }]);

    st(h).updateGameState({ score: 1 });
    expect(server.sent.at(-1)).toEqual({
      toolResponse: {
        functionResponses: [{ id: "c1", name: "submit_answer", response: { ok: true, state: { score: 1 } } }],
      },
    });
  });

  it("launch_game sets the pending navigation and answers the model", async () => {
    const h = setup();
    const server = await connectActive(h);
    server.push({ toolCall: { functionCalls: [{ id: "c2", name: "launch_game", args: {} }] } });
    expect(st(h).pendingNavigation).toBe("/games");
    expect(server.sent.at(-1)).toMatchObject({
      toolResponse: { functionResponses: [{ id: "c2", response: { ok: true } }] },
    });
  });

  it("deaf stops the microphone and the speaker; a deliberate wake restarts the mic", async () => {
    const h = setup();
    await connectActive(h);
    st(h).deactivate();
    expect(st(h).state).toBe("deaf");
    expect(h.audio.mic.stops).toBeGreaterThan(0);

    await st(h).activate();
    await flush();
    expect(st(h).state).toBe("active");
    expect(h.audio.mic.starts).toBe(2);
  });

  it("endSession closes the socket and releases mic and speaker", async () => {
    const h = setup();
    const server = await connectActive(h);
    expect(h.session.outputLevel()).toBe(0.42);

    st(h).endSession();
    expect(server.closed).toBe(true);
    expect(h.audio.mic.onChunk).toBeNull();
    expect(h.audio.speaker.destroyed).toBe(1);
    expect(st(h).state).toBe("disconnected");
    expect(h.session.outputLevel()).toBe(0);
    expect(h.exitHandlers.size).toBe(0);
  });

  it("an app exit flushes the in-progress round", async () => {
    const h = setup();
    const server = await connectActive(h);
    server.push({ serverContent: { inputTranscription: { text: "Ich mag Mangos" } } });
    expect(h.recordRound).not.toHaveBeenCalled();
    for (const handler of h.exitHandlers) handler();
    expect(h.recordRound).toHaveBeenCalledWith(
      expect.objectContaining({ role: "kid", text: "Ich mag Mangos" }),
    );
  });

  it("falls asleep after five minutes without interaction", async () => {
    const h = setup();
    const server = await connectActive(h);
    vi.advanceTimersByTime(5 * 60 * 1000);
    expect(st(h).state).toBe("sleep");
    expect(server.closed).toBe(true);
  });

  describe("error paths", () => {
    it("a denied microphone surfaces micPermissionNeeded and stays active", async () => {
      const h = setup();
      h.audio.micError.current = new MicrophoneError("permission-denied");
      await connectActive(h);
      expect(st(h).state).toBe("active");
      expect(st(h).error).toBe("micPermissionNeeded");
    });

    it("an unsupported microphone surfaces secureContextRequired", async () => {
      const h = setup();
      h.audio.micError.current = new MicrophoneError("unsupported");
      await connectActive(h);
      expect(st(h).error).toBe("secureContextRequired");
    });

    it("any other microphone failure shows its message", async () => {
      const h = setup();
      h.audio.micError.current = new Error("device busy");
      await connectActive(h);
      expect(st(h).error).toBe("device busy");
    });

    // Seen on a Pixel 10: the native speaker's graph setup threw (an audio
    // library bug), the error vanished in the fire-and-forget presence step,
    // and the session sat in "connecting" for good: connect() skips while
    // "connecting", so no retry, not even after a force-close, could recover.
    it("a speaker that fails to start leaves 'connecting' with an error, and a retry connects", async () => {
      const h = setup();
      h.audio.speakerError.current = new RangeError("offset must be a finite non-negative number: -1");
      await connectActive(h);
      expect(st(h).state).not.toBe("connecting");
      expect(st(h).error).toBeTruthy();
      // Fatal: a local audio failure would repeat, so no auto-reconnect hot-loop.
      expect(st(h).fatalError).toBe(true);
      // Nothing leaks: the socket is closed and the speaker released.
      expect(h.servers[0].closed).toBe(true);
      expect(h.audio.speaker.destroyed).toBe(1);

      h.audio.speakerError.current = null;
      await h.session.store.getState().connect(KID);
      await flush();
      const retry = h.servers.at(-1);
      expect(retry).toBeDefined();
      expect(h.servers.length).toBeGreaterThan(1);
      retry?.handlers.onOpen();
      retry?.push({ setupComplete: {} });
      await flush();
      expect(st(h).state).toBe("active");
      expect(st(h).error).toBeNull();
    });

    it("a fatal close (quota) disconnects with fatalError and releases audio", async () => {
      const h = setup();
      const server = await connectActive(h);
      server.handlers.onClose({ code: 1011, reason: "Quota exceeded", wasClean: false });
      expect(st(h).state).toBe("disconnected");
      expect(st(h).fatalError).toBe(true);
      expect(st(h).error).toMatch(/quota/i);
      expect(h.audio.speaker.destroyed).toBe(1);
    });

    it("a transient close disconnects without fatalError (auto-reconnect may retry)", async () => {
      const h = setup();
      const server = await connectActive(h);
      server.handlers.onClose({ code: 1006, reason: "", wasClean: false });
      expect(st(h).state).toBe("disconnected");
      expect(st(h).fatalError).toBe(false);
      expect(st(h).error).toMatch(/closed unexpectedly/);
    });

    it("a socket error tears down with the error shown", async () => {
      const h = setup();
      const server = await connectActive(h);
      server.handlers.onError();
      expect(st(h).state).toBe("disconnected");
      expect(st(h).error).toBe("WebSocket connection error");
    });

    it("a failed config build is fatal (no reconnect hot-loop) and opens no socket", async () => {
      const h = setup();
      h.buildConfig.mockRejectedValueOnce(new Error("No API key configured for gemini"));
      await st(h).connect(KID);
      await flush();
      expect(st(h).state).toBe("disconnected");
      expect(st(h).fatalError).toBe(true);
      expect(st(h).error).toBe("No API key configured for gemini");
      expect(h.servers).toHaveLength(0);
    });
  });
});

describe("matchTrick", () => {
  it("finds a trick by exact name or id, then by containment, ignoring case and punctuation", async () => {
    const { matchTrick } = await import("./companion-session");
    const tricks = [
      { id: "pirouette", name: "Pirouette" },
      { id: "t1", name: "Happy dance" },
    ];
    expect(matchTrick("pirouette", tricks)?.id).toBe("pirouette");
    expect(matchTrick("HAPPY-DANCE!", tricks)?.id).toBe("t1");
    expect(matchTrick("the happy dance please", tricks)?.id).toBe("t1");
    expect(matchTrick("backflip", tricks)).toBeNull();
    expect(matchTrick("", tricks)).toBeNull();
  });
});

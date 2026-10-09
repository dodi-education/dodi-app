import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Voice `teach_trick`: the live model may call the tool again and again for the
 * same trick (a retry while the slow first call is still learning, or a re-call
 * right after it was learned). Each repeat must NOT learn and store the trick
 * once more: that is how a kid ended up with a list of identical "Froschsprung"
 * tricks while dodi looped on the tool.
 */

import { createStore } from "zustand/vanilla";

import type { VoiceSessionConfig } from "@dodi/ai/voice/session-config";
import type { VoiceSocketHandlers, VoiceTransport } from "@dodi/ai/voice/voice-socket";

import type { AudioPort } from "./companion-audio";
import { type CompanionStores, createCompanionSession } from "./companion-session";
import { createCompanionStageStore } from "./companion-stage-store";
import { createCompanionVolumeStore } from "./companion-volume-store";
import { createConnectivityStore } from "./connectivity-store";
import type { CustomTrickView, TeachTrickResult } from "./custom-tricks";

const teachTrickMock = vi.hoisted(() => vi.fn());
vi.mock("./custom-tricks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./custom-tricks")>()),
  teachTrick: teachTrickMock,
}));

const KID = "kid-1";
const COMPANION = "companion-1";

const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

interface FakeServer {
  handlers: VoiceSocketHandlers;
  sent: Array<Record<string, unknown>>;
  push(frame: Record<string, unknown>): void;
}

function storage(): { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void } {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

function learned(name: string, description: string): Extract<TeachTrickResult, { ok: true }> {
  const script = { name, duration: 1, tracks: [] } as never;
  return {
    ok: true,
    script,
    warnings: [],
    record: { v: 1, name, description, model: "dodi" as never, requiredBones: [], script },
  };
}

function setup() {
  const servers: FakeServer[] = [];
  const transport: VoiceTransport = {
    socket: (_url, _protocols, handlers) => {
      const server: FakeServer = { handlers, sent: [], push: (f) => handlers.onMessage(JSON.stringify(f)) };
      servers.push(server);
      return { isOpen: () => true, send: (t) => server.sent.push(JSON.parse(t)), close: () => {} };
    },
    fetch: vi.fn() as unknown as typeof fetch,
  };
  const audio: AudioPort = {
    createRecorder: () => ({ start: async () => {}, stop: () => {} }),
    createSpeaker: () => ({
      enqueue: () => {},
      stop: () => {},
      destroy: () => {},
      setVolume: () => {},
      backlogSeconds: () => 0,
      onPlaybackEnd: () => {},
      primeFromGesture: () => {},
      tryResume: async () => true,
      outputLevel: () => 0,
    }),
  };
  const config: VoiceSessionConfig = {
    provider: "gemini",
    apiKey: "k",
    model: "gemini-live-x",
    voiceName: "Puck",
    systemInstruction: "SYS",
  };

  const saved: CustomTrickView[] = [];
  const customTricks = createStore(() => ({
    byCompanion: {} as Record<string, CustomTrickView[]>,
    load: async () => [...saved],
    save: vi.fn(async (_companionId: string, record: ReturnType<typeof learned>["record"]) => {
      const view = { id: `t${saved.length + 1}`, ...record, script: record.script } as unknown as CustomTrickView;
      saved.push(view);
      return view;
    }),
    remove: async () => {},
    invalidate: () => {},
  }));
  const companionStage = createCompanionStageStore();
  companionStage.getState().setCharacterShown(true);

  const kid = {
    id: KID,
    display_name: "Ada",
    language: "de",
    active_companion_id: COMPANION,
    companions: [{ id: COMPANION, name: null, look: null }],
  };
  const stores = {
    kids: {
      getState: () => ({ byId: {}, list: null, loadOne: async () => kid, patchLocal: () => {}, invalidate: () => {} }),
      subscribe: createStore(() => ({})).subscribe,
    },
    games: { getState: () => ({ byKid: {}, loadForKid: async () => [] }) },
    vault: { getState: () => ({ session: null }) },
    connectivity: createConnectivityStore(true),
    companionVolume: createCompanionVolumeStore(storage()),
    execution: { resolveThinking: async () => null, resolveExecution: async () => null },
    customTricks,
    companionStage,
  } as unknown as CompanionStores;

  const session = createCompanionSession({
    api: { request: vi.fn(async () => new Response("{}", { status: 200 })) } as never,
    state: stores,
    audio,
    storage: storage(),
    randomUUID: () => "uuid",
    transport,
    lifecycle: { onExit: () => () => {} },
    services: {
      transcripts: { beginDay: vi.fn(), recordRound: vi.fn(), syncAndSeed: vi.fn(async () => {}), flushNow: vi.fn(async () => {}) },
      updateMemory: vi.fn(async () => true),
      buildHomeVoiceConfig: vi.fn(async () => config),
      buildGameVoiceConfig: vi.fn(async () => config),
    },
  });
  return { session, servers, customTricks, saved };
}

async function connect(h: ReturnType<typeof setup>): Promise<FakeServer> {
  await h.session.store.getState().connect(KID);
  await flush();
  const server = h.servers[0];
  server.handlers.onOpen();
  server.push({ setupComplete: {} });
  await flush();
  return server;
}

function teachCall(server: FakeServer, id: string, description: string): void {
  server.push({ toolCall: { functionCalls: [{ id, name: "teach_trick", args: { description } }] } });
}

function responseTo(server: FakeServer, id: string): Record<string, unknown> | undefined {
  for (const frame of server.sent) {
    const responses = (frame.toolResponse as { functionResponses?: Array<{ id: string; response: Record<string, unknown> }> })
      ?.functionResponses;
    const match = responses?.find((r) => r.id === id);
    if (match) return match.response;
  }
  return undefined;
}

describe("voice teach_trick", () => {
  beforeEach(() => {
    teachTrickMock.mockReset();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("a repeat call while the trick is still being learned does not learn it a second time", async () => {
    const h = setup();
    const server = await connect(h);
    let finish!: (r: TeachTrickResult) => void;
    teachTrickMock.mockImplementation(() => new Promise<TeachTrickResult>((resolve) => (finish = resolve)));

    teachCall(server, "c1", "jump like a frog");
    await flush();
    teachCall(server, "c2", "jump like a frog");
    await flush();

    expect(teachTrickMock).toHaveBeenCalledTimes(1);
    // The repeat is answered at once (the model is never left hanging) and told to wait.
    expect(responseTo(server, "c2")).toMatchObject({ ok: false });

    finish(learned("Froschsprung", "jump like a frog"));
    await flush();
    expect(responseTo(server, "c1")).toMatchObject({ ok: true, learned: "Froschsprung" });
    expect(h.saved).toHaveLength(1);
  });

  it("a repeat call for a trick that was just learned performs it instead of learning and storing a copy", async () => {
    const h = setup();
    const server = await connect(h);
    teachTrickMock.mockResolvedValue(learned("Froschsprung", "jump like a frog"));

    teachCall(server, "c1", "jump like a frog");
    await flush();
    expect(responseTo(server, "c1")).toMatchObject({ ok: true, learned: "Froschsprung" });

    teachCall(server, "c2", "Jump like a frog!");
    await flush();
    teachCall(server, "c3", "jump like a frog");
    await flush();

    expect(teachTrickMock).toHaveBeenCalledTimes(1);
    expect(h.saved).toHaveLength(1);
    expect(responseTo(server, "c2")).toMatchObject({ ok: true });
    expect(responseTo(server, "c3")).toMatchObject({ ok: true });
  });

  it("the success answer tells the model the trick is done, so it does not call teach_trick again", async () => {
    const h = setup();
    const server = await connect(h);
    teachTrickMock.mockResolvedValue(learned("Froschsprung", "jump like a frog"));
    teachCall(server, "c1", "jump like a frog");
    await flush();
    const response = responseTo(server, "c1");
    expect(JSON.stringify(response)).toMatch(/perform_trick/);
  });
});

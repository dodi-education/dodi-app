import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Coverage for the offline play/event outbox: client-generated play ids make
 * start synchronous and retries idempotent; patches coalesce into one entry
 * per play; the flush replays POST→PATCH in order, drops permanently rejected
 * entries (4xx), and keeps everything queued across network failures.
 */

const { dodiRequestSpy } = vi.hoisted(() => ({ dodiRequestSpy: vi.fn() }));

vi.mock("@/lib/api", () => ({ dodi: { request: dodiRequestSpy } }));

import {
  _resetForTests,
  finalizePlay,
  flushPlayOutbox,
  logGameEvent,
  recordPlayPatch,
  startPlay,
} from "@/lib/games/play-sync";
import { useConnectivityStore } from "@/stores/connectivity-store";

// --- env ---------------------------------------------------------------------

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

interface Call {
  method: string;
  url: string;
  body: Record<string, unknown>;
}

let calls: Call[] = [];
/** Per-request handler: returns the mocked status (throws to model offline). */
let respond: (call: Call) => number = () => 201;

function installRouter() {
  dodiRequestSpy.mockImplementation(
    async (url: string, init?: { method?: string; body?: string }) => {
      const call: Call = {
        method: init?.method ?? "GET",
        url,
        body: init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : {},
      };
      const status = respond(call);
      calls.push(call);
      return { ok: status < 400, status, json: async () => ({}) };
    },
  );
}

function readOutboxRaw() {
  const raw = localStorage.getItem("dodi-play-outbox");
  return raw
    ? (JSON.parse(raw) as {
        plays: Array<Record<string, unknown>>;
        events: Array<Record<string, unknown>>;
      })
    : null;
}

const GAME = "game-1";
const KID = "kid-1";

describe("play-sync", () => {
  beforeEach(() => {
    (globalThis as { localStorage?: unknown }).localStorage = makeLocalStorage();
    _resetForTests();
    calls = [];
    respond = () => 201;
    dodiRequestSpy.mockReset();
    installRouter();
  });

  afterEach(() => {
    _resetForTests();
    useConnectivityStore.setState({ isOnline: true });
  });

  it("startPlay returns a play id synchronously and the flush POSTs it", async () => {
    const playId = startPlay({ gameId: GAME, kidId: KID });
    expect(playId).toMatch(/^[0-9a-f-]{36}$/);

    await flushPlayOutbox();

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: "POST",
      url: `/api/games/${GAME}/plays`,
      body: { kidId: KID, playId },
    });
    expect(typeof calls[0].body.startedAt).toBe("string");
    // The play stays queued (start synced) until it is finalized.
    expect(readOutboxRaw()?.plays).toMatchObject([
      { playId, isStartSynced: true },
    ]);
  });

  it("coalesces patches and PATCHes after the POST, exactly once", async () => {
    const playId = startPlay({ gameId: GAME, kidId: KID });
    recordPlayPatch(playId, { finalProgress: 0.4 });
    recordPlayPatch(playId, {
      succeeded: true,
      finalProgress: 0.9,
      metrics: { correct: 3 },
    });

    await flushPlayOutbox();

    expect(calls.map((c) => c.method)).toEqual(["POST", "PATCH"]);
    expect(calls[1].url).toBe(`/api/games/${GAME}/plays/${playId}`);
    expect(calls[1].body).toMatchObject({
      succeeded: true,
      finalProgress: 0.9,
      metrics: { correct: 3 },
    });
    expect(typeof calls[1].body.succeededAt).toBe("string");
    expect(calls[1].body.ended).toBeUndefined();

    // Nothing new to say → the next flush is silent.
    calls = [];
    await flushPlayOutbox();
    expect(calls).toHaveLength(0);
  });

  it("finalizePlay ends the play and removes it after the acked PATCH", async () => {
    const playId = startPlay({ gameId: GAME, kidId: KID });
    await flushPlayOutbox();
    calls = [];

    finalizePlay(playId, { finalProgress: 0.7, metrics: { incorrect: 2 } });
    await flushPlayOutbox();

    expect(calls).toHaveLength(1);
    expect(calls[0].body).toMatchObject({ ended: true, finalProgress: 0.7 });
    expect(typeof calls[0].body.endedAt).toBe("string");
    expect(readOutboxRaw()).toBeNull();
  });

  it("keeps everything queued across network failures and drains later", async () => {
    respond = () => {
      throw new TypeError("fetch failed");
    };
    const playId = startPlay({ gameId: GAME, kidId: KID });
    finalizePlay(playId, { finalProgress: 1 });
    logGameEvent({ gameId: GAME, kidId: KID, event: "game_started", message: "x" });

    await flushPlayOutbox();
    expect(useConnectivityStore.getState().isOnline).toBe(false);
    expect(readOutboxRaw()?.plays).toHaveLength(1);
    expect(readOutboxRaw()?.events).toHaveLength(1);

    respond = () => 201;
    await flushPlayOutbox();
    expect(calls.map((c) => c.method)).toEqual(["POST", "PATCH", "POST"]);
    expect(readOutboxRaw()).toBeNull();
  });

  it("treats an idempotent 200 replay of the POST as synced", async () => {
    respond = (call) => (call.method === "POST" ? 200 : 201);
    const playId = startPlay({ gameId: GAME, kidId: KID });
    await flushPlayOutbox();

    expect(readOutboxRaw()?.plays).toMatchObject([
      { playId, isStartSynced: true },
    ]);
  });

  it("drops a play the server permanently rejects (4xx)", async () => {
    respond = () => 404;
    startPlay({ gameId: GAME, kidId: KID });
    await flushPlayOutbox();

    expect(readOutboxRaw()).toBeNull();
  });

  it("queues events with their occurredAt and drops them on 4xx", async () => {
    logGameEvent({ gameId: GAME, kidId: KID, event: "game_started", message: "x" });
    logGameEvent({ gameId: GAME, kidId: KID, event: "game_command_failed", message: "y" });
    respond = (call) =>
      (call.body as { event?: string }).event === "game_command_failed" ? 400 : 201;

    await flushPlayOutbox();

    expect(calls).toHaveLength(2);
    expect(typeof calls[0].body.occurredAt).toBe("string");
    // The acked and the rejected event both leave the queue.
    expect(readOutboxRaw()).toBeNull();
  });
});

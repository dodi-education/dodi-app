import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Coverage for the warm-socket pool: filling, acquire/retire, silent
 * replacement with backoff, fatal handling (auth/quota vs transient mint
 * failures), in-place config updates, max-age recycling, and teardown.
 *
 * The un-billable invariant is pinned in afterEach: the pool must NEVER send
 * anything content-like (audio/text/context/greeting) on any client it
 * created — only the store sends, and only on acquired clients.
 */

import type { VoiceClient, VoiceClientConfig, VoiceEvent } from "./voice-client";
import { VoiceSocketPool, VoiceSocketPoolError } from "./voice-socket-pool";

interface FakeClient {
  config: VoiceClientConfig;
  emit: (event: VoiceEvent) => void;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  sendAudio: ReturnType<typeof vi.fn>;
  sendText: ReturnType<typeof vi.fn>;
  sendContext: ReturnType<typeof vi.fn>;
  sendGreeting: ReturnType<typeof vi.fn>;
  sendToolResponse: ReturnType<typeof vi.fn>;
  updateSession?: ReturnType<typeof vi.fn>;
}

const CONFIG: VoiceClientConfig = {
  provider: "xai",
  apiKey: "k",
  model: "m",
  voiceName: "Rex",
  systemInstruction: "S",
};

function makeHarness(opts: { hasUpdateSession?: boolean } = {}) {
  const created: FakeClient[] = [];
  const onFatal = vi.fn();

  const createClient = (
    config: VoiceClientConfig,
    onEvent: (event: VoiceEvent) => void,
  ): VoiceClient => {
    const fake: FakeClient = {
      config,
      emit: onEvent,
      connect: vi.fn(),
      disconnect: vi.fn(),
      sendAudio: vi.fn(),
      sendText: vi.fn(),
      sendContext: vi.fn(),
      sendGreeting: vi.fn(),
      sendToolResponse: vi.fn(),
      ...(opts.hasUpdateSession !== false ? { updateSession: vi.fn() } : {}),
    };
    created.push(fake);
    return fake as unknown as VoiceClient;
  };

  const pool = new VoiceSocketPool({ config: CONFIG, createClient, onFatal });
  return { pool, created, onFatal };
}

const ready = (fake: FakeClient) => fake.emit({ type: "setupComplete" });
const closed = (
  fake: FakeClient,
  overrides: Partial<Extract<VoiceEvent, { type: "closed" }>> = {},
) =>
  fake.emit({
    type: "closed",
    code: 1006,
    reason: "",
    fatal: false,
    message: "Connection closed unexpectedly",
    ...overrides,
  });

let allCreated: FakeClient[] = [];

describe("voice socket pool", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "info").mockImplementation(() => {});
    allCreated = [];
  });

  afterEach(() => {
    // The un-billable invariant: the pool never sends content on any client.
    for (const c of allCreated) {
      expect(c.sendAudio).not.toHaveBeenCalled();
      expect(c.sendText).not.toHaveBeenCalled();
      expect(c.sendContext).not.toHaveBeenCalled();
      expect(c.sendGreeting).not.toHaveBeenCalled();
      expect(c.sendToolResponse).not.toHaveBeenCalled();
    }
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function harness(opts: { hasUpdateSession?: boolean } = {}) {
    const h = makeHarness(opts);
    allCreated = h.created;
    return h;
  }

  it("start() fills to two warm sockets; whenReady resolves on the first setupComplete", async () => {
    const { pool, created } = harness();
    pool.start();

    expect(created).toHaveLength(2);
    expect(created[0].connect).toHaveBeenCalledTimes(1);
    expect(created[1].connect).toHaveBeenCalledTimes(1);
    expect(pool.headReady).toBe(false);

    const readyPromise = pool.whenReady();
    ready(created[0]);
    await expect(readyPromise).resolves.toBeUndefined();
    expect(pool.headReady).toBe(true);
  });

  it("acquire() hands out the head without growing the pipeline (active counts)", async () => {
    const { pool, created } = harness();
    pool.start();
    ready(created[0]);
    ready(created[1]);

    const onEvent = vi.fn();
    const acquired = await pool.acquire(onEvent);

    expect(acquired).toBe(created[0]);
    // The acquired socket is part of the pipeline: 1 active + 1 warm = target.
    expect(created).toHaveLength(2);
    // The acquired client's events forward to the store handler.
    created[0].emit({ type: "turnComplete" });
    expect(onEvent).toHaveBeenCalledWith({ type: "turnComplete" });
  });

  it("acquire() while none is ready resolves on the next setupComplete", async () => {
    const { pool, created } = harness();
    pool.start();

    const onEvent = vi.fn();
    const acquirePromise = pool.acquire(onEvent);

    ready(created[1]); // the second one wins the race
    await expect(acquirePromise).resolves.toBe(created[1]);
    expect(created).toHaveLength(2); // 1 active + 1 still-connecting standby

    created[1].emit({ type: "interrupted" });
    expect(onEvent).toHaveBeenCalledWith({ type: "interrupted" });
  });

  it("retire() disconnects, swallows the retired socket's events, and warms a replacement", async () => {
    const { pool, created } = harness();
    pool.start();
    ready(created[0]);
    ready(created[1]);

    const onEvent = vi.fn();
    const acquired = await pool.acquire(onEvent);
    expect(acquired).toBe(created[0]);
    pool.retire(acquired);

    expect(created[0].disconnect).toHaveBeenCalledTimes(1);
    // The close caused by our own retire must never reach the store.
    closed(created[0]);
    expect(onEvent).not.toHaveBeenCalled();
    // Retiring the active socket warms a replacement secondary → 2 warm again.
    expect(created).toHaveLength(3);
  });

  it("replaces a warm socket that closes non-fatally, with backoff and no fatal callback", async () => {
    const { pool, created, onFatal } = harness();
    pool.start();
    ready(created[0]);
    ready(created[1]);

    closed(created[1]);
    expect(created).toHaveLength(2); // replacement waits for backoff
    await vi.advanceTimersByTimeAsync(1000);
    expect(created).toHaveLength(3);
    expect(onFatal).not.toHaveBeenCalled();

    ready(created[2]);
    expect(pool.headReady).toBe(true);
  });

  it("a fatal close (quota/auth) fires onFatal once, rejects waiters, and stops replenishing", async () => {
    const { pool, created, onFatal } = harness();
    pool.start();

    const readyPromise = pool.whenReady();
    const acquirePromise = pool.acquire(vi.fn());
    const readyRejection = readyPromise.catch((e: unknown) => e);
    const acquireRejection = acquirePromise.catch((e: unknown) => e);

    closed(created[0], {
      code: 1008,
      fatal: true,
      message: "quota exceeded",
    });

    expect(onFatal).toHaveBeenCalledTimes(1);
    expect(onFatal).toHaveBeenCalledWith("quota exceeded");
    expect(pool.hasFatalError).toBe(true);
    expect(pool.fatalErrorMessage).toBe("quota exceeded");

    const readyErr = (await readyRejection) as VoiceSocketPoolError;
    expect(readyErr.reason).toBe("fatal");
    const acquireErr = (await acquireRejection) as VoiceSocketPoolError;
    expect(acquireErr.reason).toBe("fatal");

    // The sibling warm socket shares the doomed key — closed out too.
    expect(created[1].disconnect).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(created).toHaveLength(2); // no replenishing after fatal
  });

  it("retries transient ephemeral-token mint failures before going fatal", async () => {
    const { pool, created, onFatal } = harness();
    pool.start();

    // Both initial sockets fail to mint (transient) → two retries allowed.
    closed(created[0], { fatal: true, reason: "ephemeral_token", message: "mint failed" });
    closed(created[1], { fatal: true, reason: "ephemeral_token", message: "mint failed" });
    expect(onFatal).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000); // backoff → refill
    expect(created).toHaveLength(4);

    // Retries exhausted → the next mint failure is terminal.
    closed(created[2], { fatal: true, reason: "ephemeral_token", message: "mint failed" });
    expect(onFatal).toHaveBeenCalledTimes(1);
    expect(onFatal).toHaveBeenCalledWith("mint failed");
  });

  it("an auth mint failure is fatal immediately (no retries)", () => {
    const { pool, created, onFatal } = harness();
    pool.start();

    closed(created[0], {
      fatal: true,
      reason: "ephemeral_token_auth",
      message: "bad key",
    });

    expect(onFatal).toHaveBeenCalledTimes(1);
    expect(pool.hasFatalError).toBe(true);
  });

  it("a mint success resets the transient-failure budget", async () => {
    const { pool, created, onFatal } = harness();
    pool.start();

    closed(created[0], { fatal: true, reason: "ephemeral_token", message: "mint failed" });
    closed(created[1], { fatal: true, reason: "ephemeral_token", message: "mint failed" });
    await vi.advanceTimersByTimeAsync(1000);
    ready(created[2]); // success → streak reset

    closed(created[3], { fatal: true, reason: "ephemeral_token", message: "mint failed" });
    expect(onFatal).not.toHaveBeenCalled(); // budget was reset, retry allowed
  });

  it("updateConfig() re-instructs warm sockets in place when they support it", async () => {
    const { pool, created } = harness();
    pool.start();
    ready(created[0]);
    ready(created[1]);

    const newConfig = { ...CONFIG, systemInstruction: "S2" };
    await pool.updateConfig(newConfig);

    expect(created).toHaveLength(2); // no recycling
    expect(created[0].updateSession).toHaveBeenCalledWith(newConfig);
    expect(created[1].updateSession).toHaveBeenCalledWith(newConfig);
    expect(created[0].disconnect).not.toHaveBeenCalled();
    expect(pool.headReady).toBe(true);
  });

  it("updateConfig() recycles warm sockets that cannot update in place", async () => {
    const { pool, created } = harness({ hasUpdateSession: false });
    pool.start();
    ready(created[0]);
    ready(created[1]);

    const updatePromise = pool.updateConfig({ ...CONFIG, systemInstruction: "S2" });

    expect(created[0].disconnect).toHaveBeenCalled();
    expect(created[1].disconnect).toHaveBeenCalled();
    expect(created).toHaveLength(4);
    expect(created[2].config.systemInstruction).toBe("S2");

    ready(created[2]);
    await expect(updatePromise).resolves.toBeUndefined();
  });

  it("updateConfig() supersedes a pending acquire", async () => {
    const { pool, created } = harness();
    pool.start();

    const acquireRejection = pool.acquire(vi.fn()).catch((e: unknown) => e);
    void pool.updateConfig({ ...CONFIG, systemInstruction: "S2" }).catch(() => {});

    const err = (await acquireRejection) as VoiceSocketPoolError;
    expect(err.reason).toBe("superseded");
    expect(created.length).toBeGreaterThanOrEqual(2);
  });

  it("destroy() closes everything, rejects waiters, and swallows late events", async () => {
    const { pool, created } = harness();
    pool.start();
    ready(created[0]);

    const onEvent = vi.fn();
    await pool.acquire(onEvent); // acquires created[0]
    // Nothing else is ready → this waits; it also defensively retires
    // created[0], detaching its handler.
    const acquireRejection = pool.acquire(vi.fn()).catch((e: unknown) => e);

    pool.destroy();
    pool.destroy(); // idempotent

    for (const c of created) expect(c.disconnect).toHaveBeenCalled();
    const err = (await acquireRejection) as VoiceSocketPoolError;
    expect(err.reason).toBe("destroyed");

    created[0].emit({ type: "turnComplete" });
    expect(onEvent).not.toHaveBeenCalled();
    await expect(pool.whenReady()).rejects.toMatchObject({ reason: "destroyed" });
  });

  it("recycles aged warm sockets replace-then-close", async () => {
    const { pool, created } = harness();
    pool.start();
    ready(created[0]);
    ready(created[1]);

    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);

    // One recycle at a time: a replacement is warming, nothing closed yet.
    expect(created).toHaveLength(3);
    expect(created[0].disconnect).not.toHaveBeenCalled();

    ready(created[2]); // replacement ready → the aged socket goes
    expect(created[0].disconnect).toHaveBeenCalledTimes(1);
    expect(created[1].disconnect).not.toHaveBeenCalled();

    // The second aged socket recycles on its deferred check.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(created).toHaveLength(4);
    ready(created[3]);
    expect(created[1].disconnect).toHaveBeenCalledTimes(1);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ParentToGameMessage } from "@dodi/types/games";

import { createSandboxHost, type SandboxHostEvents } from "./sandbox-host";

function setup(events: SandboxHostEvents = {}, isReachable = true) {
  const sent: ParentToGameMessage[] = [];
  const host = createSandboxHost({
    gameId: "game-1",
    post: (message) => {
      if (!isReachable) return false;
      sent.push(message);
      return true;
    },
    init: () => ({ locale: "de" }),
    events: () => events,
  });
  const token = (): string => (sent[0] as { token: string }).token;
  return { host, sent, token };
}

describe("createSandboxHost", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("sends dodi:init with the init payload and retries until game:ready", () => {
    const { host, sent, token } = setup();
    host.sendInit();
    expect(sent[0]).toMatchObject({ type: "dodi:init", payload: { gameId: "game-1", locale: "de" } });
    vi.advanceTimersByTime(650);
    expect(sent.filter((m) => m.type === "dodi:init")).toHaveLength(3);

    host.receive({ type: "game:ready", token: token(), payload: { capabilities: [] } });
    expect(host.isReady()).toBe(true);
    vi.advanceTimersByTime(3000);
    expect(sent.filter((m) => m.type === "dodi:init")).toHaveLength(3);
  });

  it("gives up retrying after ten attempts", () => {
    const { host, sent } = setup();
    host.sendInit();
    vi.advanceTimersByTime(10_000);
    expect(sent.filter((m) => m.type === "dodi:init")).toHaveLength(10);
  });

  it("queues commands until ready, then flushes them in order", () => {
    const { host, sent, token } = setup();
    host.sendInit();
    host.sendCommand({ type: "reset" } as never);
    expect(sent.some((m) => m.type === "dodi:command")).toBe(false);
    host.receive({ type: "game:ready", token: token(), payload: { capabilities: [] } });
    expect(sent.filter((m) => m.type === "dodi:command")).toEqual([
      { type: "dodi:command", token: token(), payload: { command: { type: "reset" } } },
    ]);
  });

  it("drops messages with a foreign token or an invalid shape", () => {
    const onMessage = vi.fn();
    const { host, token } = setup({ onMessage });
    host.sendInit();
    host.receive({ type: "game:state", token: "f".repeat(32), payload: {} });
    host.receive({ type: "game:nonsense", token: token() });
    host.receive("not an object");
    expect(onMessage).not.toHaveBeenCalled();
    host.receive({ type: "game:state", token: token(), payload: { score: 3 } });
    expect(onMessage).toHaveBeenCalledTimes(1);
  });

  it("routes state, progress and command results to their handlers", () => {
    const events = { onStateChange: vi.fn(), onProgress: vi.fn(), onCommandResult: vi.fn() };
    const { host, token } = setup(events);
    host.sendInit();
    host.receive({ type: "game:state", token: token(), payload: { level: 2 } });
    host.receive({ type: "game:progress", token: token(), payload: { progress: 0.5, progressLabel: "half" } });
    host.receive({
      type: "game:result",
      token: token(),
      payload: { command: { type: "get_state" }, result: { ok: true }, state: { level: 3 } },
    });
    expect(events.onStateChange).toHaveBeenCalledWith({ level: 2 });
    expect(events.onProgress).toHaveBeenCalledWith({ progress: 0.5, progressLabel: "half", metrics: undefined });
    expect(events.onCommandResult).toHaveBeenCalledWith({ level: 3 });
  });

  it("resolves a snapshot from the shim's host_snapshot reply", async () => {
    const { host, sent, token } = setup();
    host.sendInit();
    const pending = host.requestSnapshot();
    expect(sent.at(-1)).toEqual({ type: "dodi:host_snapshot", token: token() });
    host.receive({
      type: "game:event",
      token: token(),
      payload: { event: "host_snapshot", snapshot: "data:image/png;base64,AAAA" },
    });
    await expect(pending).resolves.toBe("data:image/png;base64,AAAA");
  });

  it("falls back to the shim when the game's own capture times out", async () => {
    const { host, sent } = setup();
    host.sendInit();
    const pending = host.requestSnapshot({ preferGameCapture: true });
    expect(sent.at(-1)).toMatchObject({ type: "dodi:command", payload: { command: { type: "get_snapshot" } } });
    await vi.advanceTimersByTimeAsync(2500);
    expect(sent.at(-1)?.type).toBe("dodi:host_snapshot");
    await vi.advanceTimersByTimeAsync(2500);
    await expect(pending).resolves.toBeNull();
  });

  it("tolerates an unreachable sandbox", () => {
    const { host, sent } = setup({}, false);
    expect(() => host.sendInit()).not.toThrow();
    expect(sent).toHaveLength(0);
    host.dispose();
  });
});

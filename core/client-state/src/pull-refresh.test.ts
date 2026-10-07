import { describe, expect, it, vi } from "vitest";

import { MIN_REFRESH_MS, createRefreshRegistry, settleAll } from "./pull-refresh";

/** A promise the test resolves or rejects by hand. */
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** A wait the test releases by hand, recording the requested duration. */
function manualWait() {
  const calls: number[] = [];
  const gates: Array<() => void> = [];
  const wait = (ms: number): Promise<void> => {
    calls.push(ms);
    return new Promise((resolve) => gates.push(resolve));
  };
  return { wait, calls, release: () => gates.splice(0).forEach((g) => g()) };
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe("settleAll", () => {
  it("waits for every reload and swallows failures, sync or async", async () => {
    const done: string[] = [];
    await expect(
      settleAll([
        async () => {
          done.push("a");
        },
        () => {
          throw new Error("sync");
        },
        async () => {
          throw new Error("async");
        },
        () => done.push("d"),
      ]),
    ).resolves.toBeUndefined();
    expect(done.sort()).toEqual(["a", "d"]);
  });
});

describe("refresh registry", () => {
  it("runs every key's reload concurrently and settles after all and the minimum duration", async () => {
    const timer = manualWait();
    const registry = createRefreshRegistry({ wait: timer.wait });
    const kids = deferred();
    const games = deferred();
    const startedKids = vi.fn(() => kids.promise);
    const startedGames = vi.fn(() => games.promise);
    registry.register("kids", startedKids);
    registry.register("games", startedGames);

    let isSettled = false;
    void registry.refresh().then(() => {
      isSettled = true;
    });
    // Both started at once, not one after the other.
    expect(startedKids).toHaveBeenCalledTimes(1);
    expect(startedGames).toHaveBeenCalledTimes(1);
    expect(timer.calls).toEqual([MIN_REFRESH_MS]);

    kids.resolve();
    games.reject(new Error("offline"));
    await flush();
    // Reloads done, the minimum duration not yet: the spinner stays.
    expect(isSettled).toBe(false);

    timer.release();
    await flush();
    expect(isSettled).toBe(true);
  });

  it("waits for a slow reload past the minimum duration", async () => {
    const timer = manualWait();
    const registry = createRefreshRegistry({ wait: timer.wait });
    const slow = deferred();
    registry.register("slow", () => slow.promise);

    let isSettled = false;
    void registry.refresh().then(() => {
      isSettled = true;
    });
    timer.release();
    await flush();
    expect(isSettled).toBe(false);

    slow.resolve();
    await flush();
    expect(isSettled).toBe(true);
  });

  it("never rejects, whatever the reloads do", async () => {
    const registry = createRefreshRegistry({ wait: async () => {} });
    registry.register("a", () => {
      throw new Error("boom");
    });
    registry.register("b", () => Promise.reject(new Error("offline")));
    await expect(registry.refresh()).resolves.toBeUndefined();
  });

  it("runs a key once, with its most recent registration, falling back when that leaves", async () => {
    const registry = createRefreshRegistry({ wait: async () => {} });
    const first = vi.fn();
    const second = vi.fn();
    registry.register("kids", first);
    const unregisterSecond = registry.register("kids", second);

    await registry.refresh();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);

    unregisterSecond();
    unregisterSecond(); // idempotent
    await registry.refresh();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("joins a pull made while one is running", async () => {
    const timer = manualWait();
    const registry = createRefreshRegistry({ wait: timer.wait });
    const reload = vi.fn();
    registry.register("kids", reload);

    const a = registry.refresh();
    const b = registry.refresh();
    expect(b).toBe(a);
    expect(reload).toHaveBeenCalledTimes(1);

    timer.release();
    await a;
    // Settled: the next pull starts a new round.
    void registry.refresh();
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("runs the pre-step (the reconnect probe) first, even if it throws", async () => {
    const order: string[] = [];
    const registry = createRefreshRegistry({
      wait: async () => {},
      onRefresh: () => {
        order.push("probe");
        throw new Error("probe failed");
      },
    });
    registry.register("kids", () => order.push("kids"));
    await registry.refresh();
    expect(order).toEqual(["probe", "kids"]);
  });
});

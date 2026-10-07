import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createConnectivityStore } from "./connectivity-store";
import { startReconnectProbe } from "./reconnect-probe";

describe("reconnect probe", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stays idle while online", async () => {
    const connectivity = createConnectivityStore(true);
    const probe = vi.fn(async () => {});
    const handle = startReconnectProbe({ connectivity, probe, intervalMs: 1000 });

    handle.check();
    await vi.advanceTimersByTimeAsync(5000);
    expect(probe).not.toHaveBeenCalled();
    handle.stop();
  });

  it("probes on an interval while offline and flips back online on an answer", async () => {
    const connectivity = createConnectivityStore(true);
    const probe = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(new TypeError("Network request failed"))
      .mockResolvedValue({ status: 200 });
    const handle = startReconnectProbe({ connectivity, probe, intervalMs: 1000 });

    connectivity.getState().reportOffline();
    await vi.advanceTimersByTimeAsync(1000);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(connectivity.getState().isOnline).toBe(false);

    await vi.advanceTimersByTimeAsync(1000);
    expect(probe).toHaveBeenCalledTimes(2);
    expect(connectivity.getState().isOnline).toBe(true);

    // Online again: the interval stops.
    await vi.advanceTimersByTimeAsync(5000);
    expect(probe).toHaveBeenCalledTimes(2);
    handle.stop();
  });

  it("starts probing when created offline (offline cold start)", async () => {
    const connectivity = createConnectivityStore(false);
    const probe = vi.fn(async () => {});
    const handle = startReconnectProbe({ connectivity, probe, intervalMs: 1000 });

    await vi.advanceTimersByTimeAsync(1000);
    expect(connectivity.getState().isOnline).toBe(true);
    handle.stop();
  });

  it("check() probes at once when offline, one request at a time", async () => {
    const connectivity = createConnectivityStore(false);
    let answer: () => void = () => {};
    const probe = vi.fn(() => new Promise<void>((resolve) => (answer = resolve)));
    const handle = startReconnectProbe({ connectivity, probe, intervalMs: 60_000 });

    handle.check();
    handle.check();
    expect(probe).toHaveBeenCalledTimes(1);
    answer();
    await vi.advanceTimersByTimeAsync(0);
    expect(connectivity.getState().isOnline).toBe(true);
    handle.stop();
  });

  it("stop() ends probing", async () => {
    const connectivity = createConnectivityStore(false);
    const probe = vi.fn(async () => {
      throw new TypeError("offline");
    });
    const handle = startReconnectProbe({ connectivity, probe, intervalMs: 1000 });
    handle.stop();

    await vi.advanceTimersByTimeAsync(5000);
    connectivity.getState().reportOnline();
    connectivity.getState().reportOffline();
    await vi.advanceTimersByTimeAsync(5000);
    expect(probe).not.toHaveBeenCalled();
  });
});

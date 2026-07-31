import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isCurrentlyOnline,
  onBackOnline,
  useConnectivityStore,
} from "./connectivity-store";

describe("connectivity store", () => {
  afterEach(() => {
    useConnectivityStore.setState({ isOnline: true });
  });

  it("defaults to online where navigator has no onLine signal (node/SSR)", () => {
    expect(useConnectivityStore.getState().isOnline).toBe(true);
    expect(isCurrentlyOnline()).toBe(true);
  });

  it("reportOffline / reportOnline flip the signal", () => {
    useConnectivityStore.getState().reportOffline();
    expect(isCurrentlyOnline()).toBe(false);

    useConnectivityStore.getState().reportOnline();
    expect(isCurrentlyOnline()).toBe(true);
  });

  it("onBackOnline fires only on the offline→online edge", () => {
    const callback = vi.fn();
    const unsubscribe = onBackOnline(callback);

    // online → online: no edge.
    useConnectivityStore.getState().reportOnline();
    expect(callback).not.toHaveBeenCalled();

    // online → offline: wrong direction.
    useConnectivityStore.getState().reportOffline();
    expect(callback).not.toHaveBeenCalled();

    // offline → online: fires.
    useConnectivityStore.getState().reportOnline();
    expect(callback).toHaveBeenCalledTimes(1);

    unsubscribe();
    useConnectivityStore.getState().reportOffline();
    useConnectivityStore.getState().reportOnline();
    expect(callback).toHaveBeenCalledTimes(1);
  });
});

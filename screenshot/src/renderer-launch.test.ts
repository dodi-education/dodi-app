import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ScreenshotRequest } from "@dodi/games/screenshot-contract";

/**
 * Browser lifecycle with a mocked Playwright: a failed launch or a dead
 * browser must not stick. (renderer.test.ts covers rendering on a real one.)
 */

const { launch } = vi.hoisted(() => ({ launch: vi.fn() }));
vi.mock("playwright", () => ({ chromium: { launch } }));

import { createRenderer } from "./renderer";

const REQUEST: ScreenshotRequest = { version: 1, document: "<p>x</p>" };

/** A browser whose newContext fails with a marker, so render stops right after launch. */
function fakeBrowser() {
  const listeners: Array<() => void> = [];
  return {
    on: vi.fn((event: string, listener: () => void) => {
      if (event === "disconnected") listeners.push(listener);
    }),
    newContext: vi.fn().mockRejectedValue(new Error("context-reached")),
    close: vi.fn().mockResolvedValue(undefined),
    disconnect: () => listeners.forEach((listener) => listener()),
  };
}

function renderer() {
  return createRenderer({
    maxConcurrent: 1,
    renderTimeoutMs: 1_000,
    readyTimeoutMs: 100,
    chromiumSandbox: false,
  });
}

describe("renderer browser lifecycle", () => {
  beforeEach(() => launch.mockReset());

  it("relaunches after a failed launch instead of caching the failure", async () => {
    launch
      .mockRejectedValueOnce(new Error("missing shared libraries"))
      .mockResolvedValueOnce(fakeBrowser());
    const r = renderer();

    await expect(r.render(REQUEST)).rejects.toThrow("missing shared libraries");
    await expect(r.render(REQUEST)).rejects.toThrow("context-reached");
    expect(launch).toHaveBeenCalledTimes(2);
  });

  it("reuses a healthy browser and relaunches once it disconnects", async () => {
    const first = fakeBrowser();
    launch.mockResolvedValueOnce(first).mockResolvedValueOnce(fakeBrowser());
    const r = renderer();

    await expect(r.render(REQUEST)).rejects.toThrow("context-reached");
    await expect(r.render(REQUEST)).rejects.toThrow("context-reached");
    expect(launch).toHaveBeenCalledTimes(1);

    first.disconnect();
    await expect(r.render(REQUEST)).rejects.toThrow("context-reached");
    expect(launch).toHaveBeenCalledTimes(2);
  });

  it("close() does not throw when the launch failed", async () => {
    launch.mockRejectedValueOnce(new Error("missing shared libraries"));
    const r = renderer();
    await expect(r.render(REQUEST)).rejects.toThrow("missing shared libraries");
    await expect(r.close()).resolves.toBeUndefined();
  });
});

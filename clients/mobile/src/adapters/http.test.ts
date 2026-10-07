import { afterEach, describe, expect, it, vi } from "vitest";

import { cookielessFetch } from "./http";

/**
 * expo/fetch (the app's global fetch, see src/polyfills.ts) rejects a request
 * the network never answered with its own `FetchError extends Error`, while
 * every shared offline fallback (kid/game stores, snapshots, the play outbox)
 * reads only `TypeError` as "unreachable". Mirrors expo/src/winter/fetch/
 * FetchErrors.ts.
 */
class FetchError extends Error {
  constructor(message: string) {
    super(`fetch failed: ${message}`);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cookielessFetch", () => {
  it("sends no cookies", async () => {
    const fetchMock = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await cookielessFetch("https://api.example/api/health", { method: "GET" });
    expect(fetchMock).toHaveBeenCalledWith("https://api.example/api/health", {
      method: "GET",
      credentials: "omit",
    });
  });

  it("rejects a network failure as a TypeError, like a browser", async () => {
    const original = new FetchError("Unable to resolve host");
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(original)));

    const error = await cookielessFetch("https://api.example/api/kids").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TypeError);
    expect((error as Error).message).toBe("fetch failed: Unable to resolve host");
    expect((error as { cause?: unknown }).cause).toBe(original);
  });

  it("keeps an abort's own error", async () => {
    const controller = new AbortController();
    controller.abort();
    const original = new FetchError("The operation was aborted.");
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(original)));

    const error = await cookielessFetch("https://api.example/api/kids", { signal: controller.signal }).catch(
      (e: unknown) => e,
    );
    expect(error).toBe(original);
  });

  it("passes HTTP error responses through", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 503 })));

    const res = await cookielessFetch("https://api.example/api/kids");
    expect(res.status).toBe(503);
  });
});

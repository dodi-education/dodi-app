import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The auth client talks to another origin (the platform API), so how it sends
 * requests is part of the contract with that API's CORS policy.
 */
describe("auth client request options", () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_API_URL = "https://api.test";
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("never sends credentials cross-origin", async () => {
    // The library defaults to `credentials: "include"`. That would make every
    // call a credentialed request, which the platform refuses by design (it
    // sends no access-control-allow-credentials), and the browser would block
    // the response with an opaque "Failed to fetch".
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ status: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { authClient } = await import("./client");
    await authClient.emailOtp.verifyEmail({
      email: "parent@example.com",
      otp: "123456",
    });

    expect(fetchMock).toHaveBeenCalled();
    const init = fetchMock.mock.calls[0][1] as RequestInit | undefined;
    expect(init?.credentials).toBe("omit");
  });

  it("carries the stored bearer instead", async () => {
    // Tests run in node; the client reads the token from browser storage.
    const store = new Map<string, string>([["dodi-auth-token", "tok_abc"]]);
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
      location: { protocol: "https:" },
    });
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ status: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { authClient } = await import("./client");
    await authClient.emailOtp.verifyEmail({
      email: "parent@example.com",
      otp: "123456",
    });

    const init = fetchMock.mock.calls[0][1] as RequestInit | undefined;
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe("Bearer tok_abc");
  });
});

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { updateSession } from "./middleware";

const API = "https://api.test";
const APP = "http://localhost:3000";
const TOKEN = "tok_123";

type FetchMock = ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Route the two platform calls the middleware makes. */
function mockPlatform(opts: {
  session?: { id: string; email: string } | null;
  kids?: Array<{ id: string; language: string | null }>;
}): FetchMock {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url === `${API}/api/auth/get-session`) {
      const user = opts.session ?? null;
      return jsonResponse(user ? { user, session: { token: TOKEN } } : null);
    }
    if (url === `${API}/api/kids`) return jsonResponse(opts.kids ?? []);
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function request(
  path: string,
  cookies: Record<string, string> = {},
  headers: Record<string, string> = {},
): NextRequest {
  const cookie = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
  return new NextRequest(`${APP}${path}`, {
    headers: { host: "localhost:3000", ...(cookie ? { cookie } : {}), ...headers },
  });
}

function setCookieHeader(res: Response): string {
  return res.headers.get("set-cookie") ?? "";
}

/** The platform could not answer: no /login bounce, cookie kept, page rendered. */
function expectPassedThroughAsAuthed(res: Response): void {
  expect(res.status).toBe(200);
  expect(res.headers.get("location")).toBeNull();
  expect(res.headers.get("x-middleware-request-x-dodi-authed")).toBe("1");
  expect(res.headers.get("x-dodi-anon")).toBeNull();
  expect(setCookieHeader(res)).not.toContain("dodi-session");
}

/** get-session answers with a bare status (429 rate limit, 5xx). */
function mockSessionStatus(status: number): FetchMock {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url === `${API}/api/auth/get-session`) {
      return jsonResponse({ message: "Too many requests. Please try again later." }, status);
    }
    if (url === `${API}/api/kids`) return jsonResponse([]);
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("updateSession", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", API);
    vi.stubEnv("API_URL_INTERNAL", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("redirects an anonymous visitor on a protected route to /login?next=", async () => {
    const fetchMock = mockPlatform({});
    const res = await updateSession(request("/parent/dashboard"));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/parent/dashboard");
    // No cookie ⇒ no session lookup.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the deep link's query in next= (the agent approval link)", async () => {
    mockPlatform({});
    const res = await updateSession(request("/parent/settings/agents?code=KPLX-4821"));
    const location = new URL(res.headers.get("location")!);
    expect(location.searchParams.get("next")).toBe("/parent/settings/agents?code=KPLX-4821");
  });

  it("keeps the code of the short approval link (/authorize?code=) through login", async () => {
    mockPlatform({});
    const res = await updateSession(request("/authorize?code=KPLX-4821"));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/authorize?code=KPLX-4821");
  });

  it("passes a public route through anonymously with the x-dodi-anon marker", async () => {
    mockPlatform({});
    const res = await updateSession(request("/login"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-dodi-anon")).toBe("1");
    expect(res.headers.get("x-middleware-request-x-dodi-authed")).toBe("0");
    expect(res.headers.get("x-middleware-request-x-pathname")).toBe("/login");
  });

  it("sends a signed-in visitor from the root to /home with the first kid primed", async () => {
    const fetchMock = mockPlatform({
      session: { id: "acc-1", email: "parent@example.com" },
      kids: [
        { id: "kid-1", language: "de" },
        { id: "kid-2", language: "en" },
      ],
    });
    const res = await updateSession(request("/", { "dodi-session": TOKEN }));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/home");
    const cookies = setCookieHeader(res);
    expect(cookies).toContain("dodi-active-kid=kid-1");
    expect(cookies).toContain("dodi-kid-locale=de");
    expect(cookies).toContain("dodi-view=kid");
    // Both platform calls carried the bearer from the cookie mirror.
    for (const call of fetchMock.mock.calls) {
      const init = call[1] as RequestInit;
      expect(new Headers(init.headers).get("authorization")).toBe(
        `Bearer ${TOKEN}`,
      );
    }
  });

  it("forwards the authed marker on a protected route and leaves the cookie alone", async () => {
    mockPlatform({ session: { id: "acc-1", email: "parent@example.com" } });
    const res = await updateSession(
      request("/parent/dashboard", { "dodi-session": TOKEN }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-request-x-dodi-authed")).toBe("1");
    expect(res.headers.get("x-dodi-anon")).toBeNull();
    expect(setCookieHeader(res)).not.toContain("dodi-session");
  });

  it("clears a stale session cookie when the platform answers null", async () => {
    mockPlatform({ session: null });
    const res = await updateSession(
      request("/parent/dashboard", { "dodi-session": "expired" }),
    );
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
    const cookie = setCookieHeader(res);
    expect(cookie).toMatch(/dodi-session=;/);
    expect(cookie.toLowerCase()).toMatch(/max-age=0|expires=/);
  });

  it("lets a platform outage through instead of signing the parent out", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    const res = await updateSession(
      request("/parent/dashboard", { "dodi-session": TOKEN }),
    );
    expectPassedThroughAsAuthed(res);
  });

  it("bounces a signed-in visitor away from /login", async () => {
    mockPlatform({ session: { id: "acc-1", email: "parent@example.com" } });
    const res = await updateSession(request("/login", { "dodi-session": TOKEN }));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe(
      "/parent/dashboard",
    );
  });

  // Regression: a parent's create/delete cycle fires ~100+ RSC prefetches, each
  // a get-session check; the platform's rate limit answered 429 and the
  // middleware read that as "signed out" and redirected to /login.
  describe("when the platform cannot confirm the session", () => {
    it.each([429, 500, 503])(
      "keeps a signed-in parent on the protected route (get-session %i)",
      async (status) => {
        mockSessionStatus(status);
        const res = await updateSession(
          request("/parent/dashboard", { "dodi-session": TOKEN }),
        );
        expectPassedThroughAsAuthed(res);
      },
    );

    it("renders the kid experience on a kid route rather than the anonymous shell", async () => {
      mockSessionStatus(429);
      const res = await updateSession(
        request("/home", { "dodi-session": TOKEN, "dodi-active-kid": "kid-1" }),
      );
      expectPassedThroughAsAuthed(res);
    });

    it("sends the root to /home, not /login", async () => {
      mockSessionStatus(429);
      const res = await updateSession(request("/", { "dodi-session": TOKEN }));
      expect(res.status).toBe(307);
      expect(new URL(res.headers.get("location")!).pathname).toBe("/home");
      expect(setCookieHeader(res)).not.toContain("dodi-session");
    });

    it("does not bounce /login to the dashboard on an unconfirmed session", async () => {
      mockSessionStatus(429);
      const res = await updateSession(request("/login", { "dodi-session": TOKEN }));
      expect(res.status).toBe(200);
      expect(setCookieHeader(res)).not.toContain("dodi-session");
    });

    it("still signs out on a definitive 401", async () => {
      mockSessionStatus(401);
      const res = await updateSession(
        request("/parent/dashboard", { "dodi-session": TOKEN }),
      );
      expect(res.status).toBe(307);
      expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
      expect(setCookieHeader(res)).toMatch(/dodi-session=;/);
    });
  });

  // The platform rate-limits per client IP. Without the browser's address the
  // middleware's server-to-server calls would all share one bucket.
  describe("client IP forwarding", () => {
    function sessionCallHeaders(fetchMock: FetchMock): Headers {
      const call = fetchMock.mock.calls.find(
        ([input]) => String(input) === `${API}/api/auth/get-session`,
      );
      expect(call).toBeDefined();
      return new Headers((call![1] as RequestInit).headers);
    }

    it("forwards the client address Caddy stamped", async () => {
      const fetchMock = mockPlatform({ session: { id: "acc-1", email: "p@example.com" } });
      await updateSession(
        request(
          "/parent/dashboard",
          { "dodi-session": TOKEN },
          { "x-forwarded-for": "203.0.113.7" },
        ),
      );
      expect(sessionCallHeaders(fetchMock).get("x-forwarded-for")).toBe("203.0.113.7");
    });

    it("forwards only the original client of a proxy chain", async () => {
      const fetchMock = mockPlatform({ session: { id: "acc-1", email: "p@example.com" } });
      await updateSession(
        request(
          "/parent/dashboard",
          { "dodi-session": TOKEN },
          { "x-forwarded-for": "203.0.113.7, 172.18.0.5" },
        ),
      );
      expect(sessionCallHeaders(fetchMock).get("x-forwarded-for")).toBe("203.0.113.7");
    });

    it("sends no forwarding header when the client address is unknown", async () => {
      const fetchMock = mockPlatform({ session: { id: "acc-1", email: "p@example.com" } });
      await updateSession(request("/parent/dashboard", { "dodi-session": TOKEN }));
      expect(sessionCallHeaders(fetchMock).has("x-forwarded-for")).toBe(false);
    });
  });
});

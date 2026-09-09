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

function request(path: string, cookies: Record<string, string> = {}): NextRequest {
  const cookie = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
  return new NextRequest(`${APP}${path}`, {
    headers: { host: "localhost:3000", ...(cookie ? { cookie } : {}) },
  });
}

function setCookieHeader(res: Response): string {
  return res.headers.get("set-cookie") ?? "";
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

  it("treats a platform outage as anonymous without dropping the cookie", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    const res = await updateSession(
      request("/parent/dashboard", { "dodi-session": TOKEN }),
    );
    expect(res.status).toBe(307);
    expect(setCookieHeader(res)).not.toContain("dodi-session");
  });

  it("bounces a signed-in visitor away from /login", async () => {
    mockPlatform({ session: { id: "acc-1", email: "parent@example.com" } });
    const res = await updateSession(request("/login", { "dodi-session": TOKEN }));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe(
      "/parent/dashboard",
    );
  });
});

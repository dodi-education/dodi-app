import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The /register front door's captcha gate. Better Auth itself is mocked: what
 * matters here is that with Turnstile configured the route refuses a request
 * without (400) or with a bad (403) token BEFORE `signUpEmail` runs, passes a
 * good one through, and stays out of the way when captcha is off.
 */
const { signUpEmail } = vi.hoisted(() => ({ signUpEmail: vi.fn() }));

vi.mock("@/lib/auth", () => ({
  auth: { api: { signUpEmail } },
}));

import { POST } from "./route";

const BODY = { email: "parent@example.com", password: "correct horse battery" };

function registerRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost:3001/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(BODY),
  });
}

function siteVerify(success: boolean): Response {
  return new Response(JSON.stringify({ success }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/auth/register captcha gate", () => {
  const env = { ...process.env };

  beforeEach(() => {
    signUpEmail.mockReset().mockResolvedValue({});
    process.env.TURNSTILE_SITE_KEY = "site";
    process.env.TURNSTILE_SECRET_KEY = "secret";
  });

  afterEach(() => {
    process.env = { ...env };
    vi.restoreAllMocks();
  });

  it("refuses a request without a token (400 MISSING_RESPONSE) before sign-up", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const res = await POST(registerRequest());
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "MISSING_RESPONSE" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it("refuses a token Cloudflare rejects (403 VERIFICATION_FAILED)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(siteVerify(false));
    const res = await POST(registerRequest({ "x-captcha-response": "bad" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "VERIFICATION_FAILED" });
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it("signs up once with a valid token, verifying it exactly once", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(siteVerify(true));
    const res = await POST(registerRequest({ "x-captcha-response": "good" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(signUpEmail).toHaveBeenCalledTimes(1);
    expect(signUpEmail.mock.calls[0]![0]).toMatchObject({
      body: { email: BODY.email, password: BODY.password },
    });
  });

  it("does not require a token when captcha is off", async () => {
    delete process.env.TURNSTILE_SITE_KEY;
    delete process.env.TURNSTILE_SECRET_KEY;
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const res = await POST(registerRequest());
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(signUpEmail).toHaveBeenCalledTimes(1);
  });

  it("still validates the body first (garbage is 400 without a Cloudflare call)", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const res = await POST(
      new Request("http://localhost:3001/api/auth/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-captcha-response": "good",
        },
        body: JSON.stringify({ email: "nope" }),
      }),
    );
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

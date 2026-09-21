import { afterEach, describe, expect, it, vi } from "vitest";

import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { captcha, emailOTP } from "better-auth/plugins";

import {
  CAPTCHA_HEADER,
  CAPTCHA_PROTECTED_AUTH_PATHS,
  CAPTCHA_PROVIDER,
} from "./captcha";

/**
 * Contract check of the assumptions lib/auth.ts makes about Better Auth's
 * captcha plugin, against the installed library (memory adapter, no Postgres):
 *
 *  - the paths in CAPTCHA_PROTECTED_AUTH_PATHS are the ones the plugin gates
 *    when requests arrive over HTTP through the handler;
 *  - it reads `x-captcha-response` and answers 400 MISSING_RESPONSE /
 *    403 VERIFICATION_FAILED with the codes the web client maps;
 *  - unrelated endpoints are untouched;
 *  - in-process `auth.api.*` calls are NOT gated, which is why
 *    /api/auth/register verifies the token itself.
 */
describe("Better Auth captcha plugin contract", () => {
  const BASE = "http://localhost:3001";
  const auth = betterAuth({
    baseURL: BASE,
    basePath: "/api/auth",
    secret: "test-secret-test-secret-test-secret-1234",
    database: memoryAdapter({
      user: [],
      session: [],
      account: [],
      verification: [],
    }),
    emailAndPassword: { enabled: true },
    plugins: [
      emailOTP({ sendVerificationOTP: async () => {} }),
      captcha({
        provider: CAPTCHA_PROVIDER,
        secretKey: "secret",
        endpoints: [...CAPTCHA_PROTECTED_AUTH_PATHS],
      }),
    ],
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function post(
    path: string,
    body: unknown,
    headers: Record<string, string> = {},
  ): Promise<Response> {
    return auth.handler(
      new Request(`${BASE}/api/auth${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: BASE,
          ...headers,
        },
        body: JSON.stringify(body),
      }),
    );
  }

  it.each([
    [
      "/sign-in/email",
      { email: "p@example.com", password: "correct horse battery" },
    ],
    [
      "/sign-up/email",
      { email: "p@example.com", password: "correct horse battery", name: "p" },
    ],
    [
      "/email-otp/send-verification-otp",
      { email: "p@example.com", type: "sign-in" },
    ],
  ])(
    "%s without a token is 400 MISSING_RESPONSE, no Cloudflare call",
    async (path, body) => {
      const fetchMock = vi.spyOn(globalThis, "fetch");
      const res = await post(path, body);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ code: "MISSING_RESPONSE" });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("rejects a token Cloudflare turns down with 403 VERIFICATION_FAILED", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: false }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const res = await post(
      "/sign-in/email",
      { email: "p@example.com", password: "correct horse battery" },
      { [CAPTCHA_HEADER]: "bad" },
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "VERIFICATION_FAILED" });
  });

  it("lets a request with a good token through to the endpoint itself", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const res = await post(
      "/sign-in/email",
      { email: "nobody@example.com", password: "correct horse battery" },
      { [CAPTCHA_HEADER]: "good" },
    );
    // Past the captcha: the endpoint answers for itself (unknown user).
    expect(res.status).toBe(401);
    expect(await res.json()).not.toMatchObject({ code: "MISSING_RESPONSE" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toContain(
      "challenges.cloudflare.com",
    );
  });

  it("does not gate endpoints outside the list", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const res = await post("/email-otp/verify-email", {
      email: "p@example.com",
      otp: "000000",
    });
    // The endpoint answers for itself (bad code), not the captcha gate.
    expect(await res.json()).not.toMatchObject({ code: "MISSING_RESPONSE" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not run for in-process auth.api calls (so /register must verify itself)", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(
      auth.api.signInEmail({
        body: {
          email: "nobody@example.com",
          password: "correct horse battery",
        },
      }),
    ).rejects.toMatchObject({ statusCode: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Better Auth captcha plugin hostname pinning", () => {
  const BASE = "http://localhost:3001";
  const auth = betterAuth({
    baseURL: BASE,
    basePath: "/api/auth",
    secret: "test-secret-test-secret-test-secret-1234",
    database: memoryAdapter({
      user: [],
      session: [],
      account: [],
      verification: [],
    }),
    emailAndPassword: { enabled: true },
    plugins: [
      captcha({
        provider: CAPTCHA_PROVIDER,
        secretKey: "secret",
        endpoints: [...CAPTCHA_PROTECTED_AUTH_PATHS],
        allowedHostnames: ["app.dodi.app"],
      }),
    ],
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function signIn(hostname?: string): Promise<Response> {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true, hostname }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    return auth.handler(
      new Request(`${BASE}/api/auth/sign-in/email`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: BASE,
          [CAPTCHA_HEADER]: "tok",
        },
        body: JSON.stringify({
          email: "nobody@example.com",
          password: "correct horse battery",
        }),
      }),
    );
  }

  it("refuses a valid token solved on another hostname (403)", async () => {
    const res = await signIn("evil.example");
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "VERIFICATION_FAILED" });
  });

  it("refuses a valid token with no hostname reported (403)", async () => {
    const res = await signIn(undefined);
    expect(res.status).toBe(403);
  });

  it("passes a token solved on the pinned hostname through to the endpoint", async () => {
    const res = await signIn("app.dodi.app");
    expect(res.status).toBe(401); // unknown user: the endpoint itself answered
    expect(await res.json()).not.toMatchObject({ code: "VERIFICATION_FAILED" });
  });
});

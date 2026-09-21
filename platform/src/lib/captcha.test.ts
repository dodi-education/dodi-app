import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CAPTCHA_HEADER,
  getCaptchaConfig,
  resetCaptchaWarnings,
  verifyCaptchaRequest,
  verifyCaptchaToken,
} from "./captcha";

const CONFIG = { siteKey: "site", secretKey: "secret", allowedHostnames: [] };
const PINNED = { ...CONFIG, allowedHostnames: ["app.dodi.app"] };

function siteVerifyResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("getCaptchaConfig", () => {
  const env = { ...process.env };
  beforeEach(() => {
    delete process.env.TURNSTILE_SITE_KEY;
    delete process.env.TURNSTILE_SECRET_KEY;
    delete process.env.TURNSTILE_ALLOWED_HOSTNAMES;
    resetCaptchaWarnings();
  });
  afterEach(() => {
    process.env = { ...env };
    vi.restoreAllMocks();
  });

  it("is off when neither key is set", () => {
    expect(getCaptchaConfig()).toBeNull();
  });

  it("returns both keys when both are set, with no hostname pinning by default", () => {
    process.env.TURNSTILE_SITE_KEY = " site ";
    process.env.TURNSTILE_SECRET_KEY = "secret";
    expect(getCaptchaConfig()).toEqual({
      siteKey: "site",
      secretKey: "secret",
      allowedHostnames: [],
    });
  });

  it("parses TURNSTILE_ALLOWED_HOSTNAMES as a lower-cased comma list", () => {
    process.env.TURNSTILE_SITE_KEY = "site";
    process.env.TURNSTILE_SECRET_KEY = "secret";
    process.env.TURNSTILE_ALLOWED_HOSTNAMES =
      " App.dodi.app, staging.dodi.app ,, ";
    expect(getCaptchaConfig()?.allowedHostnames).toEqual([
      "app.dodi.app",
      "staging.dodi.app",
    ]);
  });

  it("stays off (with one warning) when only one key is set", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.TURNSTILE_SECRET_KEY = "secret";
    expect(getCaptchaConfig()).toBeNull();
    expect(getCaptchaConfig()).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toMatch(/only one of/i);
  });
});

describe("verifyCaptchaToken", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts secret, token and remote IP to siteverify and passes on success", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(siteVerifyResponse({ success: true }));
    const verdict = await verifyCaptchaToken("tok", CONFIG, "203.0.113.9");
    expect(verdict).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      secret: "secret",
      response: "tok",
      remoteip: "203.0.113.9",
    });
  });

  it("omits remoteip when the client IP is unknown", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(siteVerifyResponse({ success: true }));
    await verifyCaptchaToken("tok", CONFIG, null);
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))).toEqual({
      secret: "secret",
      response: "tok",
    });
  });

  it("rejects a token Cloudflare does not accept (403)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      siteVerifyResponse({
        success: false,
        "error-codes": ["invalid-input-response"],
      }),
    );
    expect(await verifyCaptchaToken("tok", CONFIG)).toMatchObject({
      ok: false,
      code: "VERIFICATION_FAILED",
      status: 403,
    });
  });

  it("with pinning, refuses a token solved on another hostname (403)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      siteVerifyResponse({ success: true, hostname: "evil.example" }),
    );
    expect(await verifyCaptchaToken("tok", PINNED)).toMatchObject({
      ok: false,
      code: "VERIFICATION_FAILED",
      status: 403,
    });
  });

  it("with pinning, refuses a token whose hostname is missing (403)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      siteVerifyResponse({ success: true }),
    );
    expect(await verifyCaptchaToken("tok", PINNED)).toMatchObject({
      ok: false,
      code: "VERIFICATION_FAILED",
    });
  });

  it("with pinning, passes a token solved on an allowed hostname (case-insensitive)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      siteVerifyResponse({ success: true, hostname: "App.dodi.app" }),
    );
    expect(await verifyCaptchaToken("tok", PINNED)).toEqual({ ok: true });
  });

  it("without pinning, ignores the reported hostname (dev with test keys)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      siteVerifyResponse({ success: true, hostname: "example.com" }),
    );
    expect(await verifyCaptchaToken("tok", CONFIG)).toEqual({ ok: true });
  });

  it("fails closed when siteverify is unreachable or broken (500)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNRESET"));
    expect(await verifyCaptchaToken("tok", CONFIG)).toMatchObject({
      ok: false,
      code: "UNKNOWN_ERROR",
      status: 500,
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      siteVerifyResponse({}, 502),
    );
    expect(await verifyCaptchaToken("tok", CONFIG)).toMatchObject({
      ok: false,
      code: "UNKNOWN_ERROR",
    });
  });
});

describe("verifyCaptchaRequest", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("answers MISSING_RESPONSE (400) without calling Cloudflare when the header is absent", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const verdict = await verifyCaptchaRequest(
      new Request("http://x/"),
      CONFIG,
    );
    expect(verdict).toMatchObject({
      ok: false,
      code: "MISSING_RESPONSE",
      status: 400,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("verifies the header token with the forwarded client IP", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(siteVerifyResponse({ success: true }));
    const request = new Request("http://x/", {
      headers: {
        [CAPTCHA_HEADER]: "tok",
        "x-forwarded-for": "198.51.100.7, 10.0.0.1",
      },
    });
    expect(await verifyCaptchaRequest(request, CONFIG)).toEqual({ ok: true });
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))).toMatchObject(
      {
        response: "tok",
        remoteip: "198.51.100.7",
      },
    );
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The screenshot proxy's gates, in order: body size, the account's opt-in,
 * worker configuration, request shape, the per-account limit, then the
 * forward. The worker itself is mocked; what matters here is that no gate is
 * skippable and that failures never carry the document into telemetry.
 */

const {
  getAccountMock,
  consumeRateLimitMock,
  loadConfigMock,
  renderMock,
  logServerErrorMock,
} = vi.hoisted(() => ({
  getAccountMock: vi.fn(),
  consumeRateLimitMock: vi.fn(),
  loadConfigMock: vi.fn(),
  renderMock: vi.fn(),
  logServerErrorMock: vi.fn(),
}));

vi.mock("@/lib/resolve-auth", () => ({
  requireAuth: vi.fn(async () => ({ accountId: "acc-1", db: {} })),
}));
vi.mock("@/lib/db", () => ({ serviceDb: {} }));
vi.mock("@/lib/error-logs", () => ({
  logServerError: logServerErrorMock,
  serverErrorResponse: vi.fn(
    () => new Response(JSON.stringify({ error: "server" }), { status: 500 }),
  ),
}));
vi.mock("@/services/accounts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/accounts")>()),
  getAccount: getAccountMock,
}));
vi.mock("@/services/rate-limits", () => ({ consumeRateLimit: consumeRateLimitMock }));
vi.mock("@/lib/screenshot-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/screenshot-client")>()),
  loadScreenshotServiceConfig: loadConfigMock,
  renderViaScreenshotService: renderMock,
}));

import { ScreenshotServiceError } from "@/lib/screenshot-client";

import { POST, SCREENSHOT_RATE_LIMIT } from "./route";

const DOCUMENT = "<html><body>game</body></html>";
const FRAME = "data:image/jpeg;base64,RlJBTUU=";
const REPLY = { version: 1, frames: [{ label: "initial", image: FRAME }], ready: true, warnings: [], errors: [] };

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return new Request("https://platform.test/api/games/screenshot", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: raw,
  });
}

const validBody = { version: 1, document: DOCUMENT, steps: [{ label: "after a tap" }] };

describe("POST /api/games/screenshot", () => {
  beforeEach(() => {
    getAccountMock.mockReset().mockResolvedValue({ id: "acc-1", game_screenshot_service: { mode: "dodi" } });
    consumeRateLimitMock.mockReset().mockResolvedValue({
      allowed: true,
      count: 1,
      limit: 60,
      resetAt: new Date("2026-09-22T11:00:00Z"),
    });
    loadConfigMock.mockReset().mockReturnValue({ url: "http://screenshot:3006", secret: "s" });
    renderMock.mockReset().mockResolvedValue(REPLY);
    logServerErrorMock.mockReset();
  });

  it("forwards a valid request and returns the worker's reply verbatim", async () => {
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(REPLY);
    expect(renderMock).toHaveBeenCalledWith(
      { url: "http://screenshot:3006", secret: "s" },
      expect.objectContaining({ document: DOCUMENT, steps: [{ label: "after a tap" }] }),
    );
    expect(consumeRateLimitMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ accountId: "acc-1", ...SCREENSHOT_RATE_LIMIT }),
    );
  });

  it("refuses an oversized body before reading it", async () => {
    const res = await POST(makeRequest(validBody, { "content-length": String(5_000_000) }));
    expect(res.status).toBe(413);
    expect(getAccountMock).not.toHaveBeenCalled();
    expect(renderMock).not.toHaveBeenCalled();
  });

  it.each([{ mode: "off" }, { mode: "custom", customUrlEnc: "enc:v1:x" }, null])(
    "refuses accounts that did not choose the dodi service (%o)",
    async (setting) => {
      getAccountMock.mockResolvedValue({ id: "acc-1", game_screenshot_service: setting });
      const res = await POST(makeRequest(validBody));
      expect(res.status).toBe(setting === null ? 200 : 403);
      if (setting !== null) {
        expect(await res.json()).toEqual({ error: "screenshot_service_not_enabled" });
        expect(renderMock).not.toHaveBeenCalled();
      }
    },
  );

  it("answers 503 when no worker is configured (self-host without one)", async () => {
    loadConfigMock.mockReturnValue(null);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "screenshot_service_unavailable" });
    expect(consumeRateLimitMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed request before spending rate-limit budget", async () => {
    for (const body of [{ version: 2, document: DOCUMENT }, { version: 1 }, "not json"]) {
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(400);
    }
    expect(consumeRateLimitMock).not.toHaveBeenCalled();
    expect(renderMock).not.toHaveBeenCalled();
  });

  it("answers 429 with the reset time once the account is over its limit", async () => {
    consumeRateLimitMock.mockResolvedValue({
      allowed: false,
      count: 61,
      limit: 60,
      resetAt: new Date("2026-09-22T11:00:00Z"),
    });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: "rate_limited",
      retryAt: "2026-09-22T11:00:00.000Z",
    });
    expect(renderMock).not.toHaveBeenCalled();
  });

  it.each([
    [new ScreenshotServiceError("timeout", 0), 504],
    [new ScreenshotServiceError("busy", 429), 429],
    [new ScreenshotServiceError("render timeout", 504), 504],
    [new ScreenshotServiceError("malformed", 502), 502],
    [new ScreenshotServiceError("worker 500", 500), 502],
  ])("maps a worker failure (%s) to %i and logs sizes only", async (error, status) => {
    renderMock.mockRejectedValue(error);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error: "screenshot_service_failed" });
    expect(logServerErrorMock).toHaveBeenCalledTimes(1);
    const [, , opts] = logServerErrorMock.mock.calls[0];
    expect(opts.meta).toEqual({
      documentBytes: DOCUMENT.length,
      steps: 1,
      durationMs: expect.any(Number),
    });
    expect(JSON.stringify(logServerErrorMock.mock.calls[0])).not.toContain(DOCUMENT);
  });
});

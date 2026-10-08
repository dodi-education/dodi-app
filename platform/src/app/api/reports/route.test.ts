import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * POST /api/reports: validates the report, caps reports per account, maps an
 * unknown kid or game to 404, and emails the operator once it is stored.
 */

const { createMock, notifyMock, rateLimitMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  notifyMock: vi.fn(),
  rateLimitMock: vi.fn(),
}));

vi.mock("@/lib/resolve-auth", () => ({
  requireAuth: vi.fn(async () => ({ accountId: "acc-1", db: {}, via: "user" })),
}));
vi.mock("@/lib/db", () => ({ serviceDb: {} }));
vi.mock("@/lib/error-logs", () => ({
  serverErrorResponse: vi.fn(
    () => new Response(JSON.stringify({ error: "server" }), { status: 500 }),
  ),
}));
vi.mock("@/services/rate-limits", () => ({ consumeRateLimit: rateLimitMock }));
vi.mock("@/services/report-notifications", () => ({ notifyContentReported: notifyMock }));
vi.mock("@/services/content-reports", async () => {
  class ContentReportTargetError extends Error {}
  return { createContentReport: createMock, ContentReportTargetError };
});

import { ContentReportTargetError } from "@/services/content-reports";

import { POST } from "./route";

const KID = "5b6f0a53-7f0a-4b53-9a53-000000000001";

function post(body: unknown): Request {
  return new Request("https://platform.test/api/reports", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID = {
  contentKind: "companion_answer",
  reason: "upsetting",
  details: "  It talked about monsters under the bed.  ",
  kidId: KID,
  clientPlatform: "mobile",
};

describe("POST /api/reports", () => {
  beforeEach(() => {
    createMock.mockReset().mockResolvedValue({ id: "report-1" });
    notifyMock.mockReset().mockResolvedValue(undefined);
    rateLimitMock.mockReset().mockResolvedValue({ allowed: true });
  });

  it("stores the report and notifies the operator", async () => {
    const res = await POST(post(VALID));

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "report-1" });
    expect(createMock).toHaveBeenCalledWith({}, {
      accountId: "acc-1",
      contentKind: "companion_answer",
      reason: "upsetting",
      details: "It talked about monsters under the bed.",
      kidId: KID,
      gameId: null,
      clientPlatform: "mobile",
    });
    expect(notifyMock).toHaveBeenCalledWith({}, { id: "report-1" });
  });

  it("rejects an unknown kind, reason or an overlong description", async () => {
    expect((await POST(post({ ...VALID, contentKind: "persona" }))).status).toBe(400);
    expect((await POST(post({ ...VALID, reason: "boring" }))).status).toBe(400);
    expect((await POST(post({ ...VALID, details: "x".repeat(2001) }))).status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("answers 404 for a kid or game the reporter cannot refer to", async () => {
    createMock.mockRejectedValue(new ContentReportTargetError("Unknown kid"));

    const res = await POST(post(VALID));

    expect(res.status).toBe(404);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("caps reports per account", async () => {
    rateLimitMock.mockResolvedValue({ allowed: false });

    const res = await POST(post(VALID));

    expect(res.status).toBe(429);
    expect(createMock).not.toHaveBeenCalled();
  });
});

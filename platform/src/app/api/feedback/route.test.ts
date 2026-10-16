import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * POST /api/feedback: validates the message, caps messages per account, maps
 * a game the sender cannot refer to to 404, and emails the operator once it
 * is stored.
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
vi.mock("@/services/feedback-notifications", () => ({ notifyFeedbackReceived: notifyMock }));
vi.mock("@/services/feedback-messages", async () => {
  class FeedbackTargetError extends Error {}
  return { createFeedbackMessage: createMock, FeedbackTargetError };
});

import { FeedbackTargetError } from "@/services/feedback-messages";

import { POST } from "./route";

const GAME = "5b6f0a53-7f0a-4b53-9a53-000000000001";

function post(body: unknown): Request {
  return new Request("https://platform.test/api/feedback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID = {
  senderName: "  Sam  ",
  category: "inappropriate_content",
  message: "  The game talked about monsters under the bed.  ",
  gameId: GAME,
  clientPlatform: "mobile",
};

describe("POST /api/feedback", () => {
  beforeEach(() => {
    createMock.mockReset().mockResolvedValue({ id: "feedback-1" });
    notifyMock.mockReset().mockResolvedValue(undefined);
    rateLimitMock.mockReset().mockResolvedValue({ allowed: true });
  });

  it("stores the message and notifies the operator", async () => {
    const res = await POST(post(VALID));

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "feedback-1" });
    expect(createMock).toHaveBeenCalledWith({}, {
      accountId: "acc-1",
      senderName: "Sam",
      category: "inappropriate_content",
      message: "The game talked about monsters under the bed.",
      gameId: GAME,
      clientPlatform: "mobile",
    });
    expect(notifyMock).toHaveBeenCalledWith({}, { id: "feedback-1" });
  });

  it("stores a message without a game", async () => {
    const { gameId: _, ...noGame } = VALID;

    const res = await POST(post({ ...noGame, category: "feature_request" }));

    expect(res.status).toBe(201);
    expect(createMock).toHaveBeenCalledWith({}, expect.objectContaining({ gameId: null }));
  });

  it("rejects a missing name, a name with a line break, a bad message or category", async () => {
    expect((await POST(post({ ...VALID, senderName: " " }))).status).toBe(400);
    expect((await POST(post({ ...VALID, senderName: "Sam\nBcc: x" }))).status).toBe(400);
    expect((await POST(post({ ...VALID, message: "   " }))).status).toBe(400);
    expect((await POST(post({ ...VALID, message: "x".repeat(4001) }))).status).toBe(400);
    expect((await POST(post({ ...VALID, category: "praise" }))).status).toBe(400);
    expect((await POST(post(null))).status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("answers 404 for a game the sender cannot refer to", async () => {
    createMock.mockRejectedValue(new FeedbackTargetError("Unknown game"));

    const res = await POST(post(VALID));

    expect(res.status).toBe(404);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("caps messages per account", async () => {
    rateLimitMock.mockResolvedValue({ allowed: false });

    const res = await POST(post(VALID));

    expect(res.status).toBe(429);
    expect(createMock).not.toHaveBeenCalled();
  });
});

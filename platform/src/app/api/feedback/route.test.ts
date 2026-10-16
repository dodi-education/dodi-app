import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * POST /api/feedback: validates the message and its optional image (by the
 * image's own bytes), caps messages per account, maps a game the sender cannot
 * refer to to 404, and emails the operator once it is stored.
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
vi.mock("@/services/feedback-messages", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/feedback-messages")>();
  class FeedbackTargetError extends Error {}
  return {
    createFeedbackMessage: createMock,
    decodeFeedbackImage: actual.decodeFeedbackImage,
    FeedbackTargetError,
  };
});

import { FeedbackTargetError } from "@/services/feedback-messages";

import { POST } from "./route";

const GAME = "5b6f0a53-7f0a-4b53-9a53-000000000001";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://platform.test/api/feedback", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function dataUrl(type: string, bytes: Uint8Array | string): string {
  return `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
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
      image: null,
    });
    expect(notifyMock).toHaveBeenCalledWith({}, { id: "feedback-1" }, null);
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

  it("stores and mails an attached image as the type its bytes show", async () => {
    const res = await POST(post({ ...VALID, image: dataUrl("image/jpeg", JPEG) }));

    expect(res.status).toBe(201);
    const image = { contentType: "image/jpeg", bytes: expect.any(Uint8Array) };
    expect(createMock).toHaveBeenCalledWith({}, expect.objectContaining({ image }));
    const stored = (createMock.mock.calls[0] as unknown as [unknown, { image: { bytes: Uint8Array } }])[1];
    expect([...stored.image.bytes]).toEqual([...JPEG]);
    expect(notifyMock).toHaveBeenCalledWith({}, { id: "feedback-1" }, expect.objectContaining(image));
  });

  it("refuses an image whose bytes are not what its label says", async () => {
    const mislabelled = await POST(post({ ...VALID, image: dataUrl("image/png", JPEG) }));
    expect(mislabelled.status).toBe(400);
    expect(await mislabelled.json()).toMatchObject({ code: "INVALID_IMAGE" });
    expect((await POST(post({ ...VALID, image: dataUrl("image/jpeg", "<svg/>") }))).status).toBe(400);
    expect((await POST(post({ ...VALID, image: dataUrl("image/svg+xml", "<svg/>") }))).status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
    expect(rateLimitMock).not.toHaveBeenCalled();
  });

  it("refuses a body far larger than any valid message", async () => {
    const res = await POST(post(VALID, { "content-length": String(5 * 1024 * 1024) }));

    expect(res.status).toBe(413);
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

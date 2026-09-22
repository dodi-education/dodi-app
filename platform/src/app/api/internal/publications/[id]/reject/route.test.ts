import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ serviceDb: {} }));
vi.mock("@/services/game-publications", async () => {
  class PublicationError extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message);
      this.name = "PublicationError";
    }
  }
  return { PublicationError, rejectPublication: vi.fn() };
});
vi.mock("@/services/publication-notifications", () => ({
  notifyPublicationRejected: vi.fn(),
  notifyPublisherRejected: vi.fn(),
}));

import {
  PublicationError,
  rejectPublication,
} from "@/services/game-publications";
import {
  notifyPublicationRejected,
  notifyPublisherRejected,
} from "@/services/publication-notifications";

import { POST } from "./route";

const ID = "0d15c0de-0000-4000-8000-000000000001";
const URL = `https://platform.dodi.app/api/internal/publications/${ID}/reject`;

const PUBLICATION = {
  id: ID,
  rejected_at: "2026-05-13T10:00:00.000Z",
  title: "Counting Comets",
};

const SOFT_BODY = {
  kind: "soft",
  reasons: [{ code: "soft_quality_below_bar", note: "dead ends" }],
  actor: "ops@dodi.app",
};

function request(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(URL, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const context = { params: Promise.resolve({ id: ID }) };

beforeEach(() => {
  process.env.OPS_SECRET = "right";
  vi.mocked(rejectPublication).mockReset();
  vi.mocked(rejectPublication).mockResolvedValue(
    PUBLICATION as unknown as Awaited<ReturnType<typeof rejectPublication>>,
  );
  vi.mocked(notifyPublicationRejected).mockReset();
  vi.mocked(notifyPublicationRejected).mockResolvedValue(undefined);
  vi.mocked(notifyPublisherRejected).mockReset();
  vi.mocked(notifyPublisherRejected).mockResolvedValue(undefined);
});

describe("POST /api/internal/publications/[id]/reject", () => {
  it("refuses a request without the ops secret", async () => {
    const res = await POST(request(SOFT_BODY), context);
    expect(res.status).toBe(401);
    expect(rejectPublication).not.toHaveBeenCalled();
  });

  it("refuses a kind that does not match the worst reason code", async () => {
    const res = await POST(
      request(
        {
          kind: "soft",
          reasons: [{ code: "hard_child_safety", note: "grooming pattern" }],
          actor: "ops@dodi.app",
        },
        { "x-ops-secret": "right" },
      ),
      context,
    );
    expect(res.status).toBe(400);
    expect(rejectPublication).not.toHaveBeenCalled();
  });

  it("refuses an empty reason list", async () => {
    const res = await POST(
      request(
        { kind: "soft", reasons: [], actor: "ops@dodi.app" },
        { "x-ops-secret": "right" },
      ),
      context,
    );
    expect(res.status).toBe(400);
    expect(rejectPublication).not.toHaveBeenCalled();
  });

  it("refuses a missing actor", async () => {
    const res = await POST(
      request(
        { kind: "soft", reasons: SOFT_BODY.reasons },
        { "x-ops-secret": "right" },
      ),
      context,
    );
    expect(res.status).toBe(400);
  });

  it("stamps the rejection and notifies the operator before the publisher", async () => {
    const order: string[] = [];
    vi.mocked(notifyPublicationRejected).mockImplementation(async () => {
      order.push("operator");
    });
    vi.mocked(notifyPublisherRejected).mockImplementation(async () => {
      order.push("publisher");
    });

    const res = await POST(
      request(SOFT_BODY, { "x-ops-secret": "right" }),
      context,
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      publication: {
        id: ID,
        rejectedAt: "2026-05-13T10:00:00.000Z",
        rejectionKind: "soft",
      },
    });
    expect(rejectPublication).toHaveBeenCalledWith({}, ID, {
      kind: "soft",
      reasons: SOFT_BODY.reasons,
    });
    expect(order).toEqual(["operator", "publisher"]);
  });

  it("accepts a hard rejection when every reason agrees", async () => {
    const res = await POST(
      request(
        {
          kind: "hard",
          reasons: [
            { code: "hard_child_safety", note: "asks for the kid's address" },
            { code: "soft_quality_below_bar", note: "also broken" },
          ],
          actor: "ops@dodi.app",
        },
        { "x-ops-secret": "right" },
      ),
      context,
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      publication: { rejectionKind: "hard" },
    });
  });

  it("passes a PublicationError status through", async () => {
    vi.mocked(rejectPublication).mockRejectedValue(
      new PublicationError("Publication not found", 404),
    );
    const res = await POST(
      request(SOFT_BODY, { "x-ops-secret": "right" }),
      context,
    );
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: "Publication not found",
    });
    expect(notifyPublicationRejected).not.toHaveBeenCalled();
    expect(notifyPublisherRejected).not.toHaveBeenCalled();
  });
});

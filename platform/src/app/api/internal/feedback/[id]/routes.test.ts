import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ serviceDb: {} }));
vi.mock("@/services/feedback-messages", () => ({
  getOpsFeedback: vi.fn(),
  markFeedbackRead: vi.fn(),
  solveFeedback: vi.fn(),
  reopenFeedback: vi.fn(),
}));

import {
  getOpsFeedback,
  markFeedbackRead,
  reopenFeedback,
  solveFeedback,
} from "@/services/feedback-messages";

import { POST as read } from "./read/route";
import { POST as reopen } from "./reopen/route";
import { GET as detail } from "./route";
import { POST as solve } from "./solve/route";

/**
 * The ops console's per-message feedback routes: the auth gate, id checks,
 * the staff actor, and the 404 / 409 mapping of the service outcomes.
 */

const ID = "0d15c0de-0000-4000-8000-000000000001";
const STAFF = "ops@dodi.app";

function request(
  options: { body?: unknown; secret?: string | null; headers?: Record<string, string> } = {},
): Request {
  const { body, secret = "right", headers = {} } = options;
  return new Request(`https://platform.dodi.app/api/internal/feedback/${ID}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "content-type": "application/json",
      ...(secret ? { "x-ops-secret": secret } : {}),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function context(id = ID): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPS_SECRET = "right";
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.mocked(getOpsFeedback).mockResolvedValue({ id: ID } as never);
  vi.mocked(markFeedbackRead).mockResolvedValue("ok");
  vi.mocked(solveFeedback).mockResolvedValue("ok");
  vi.mocked(reopenFeedback).mockResolvedValue("ok");
});

describe("the per-message feedback routes", () => {
  it("refuse a caller without the ops secret", async () => {
    expect((await detail(request({ secret: null }), context())).status).toBe(401);
    expect((await read(request({ body: { actor: STAFF }, secret: "wrong" }), context())).status).toBe(401);
    expect((await solve(request({ body: { actor: STAFF }, secret: null }), context())).status).toBe(401);
    expect((await reopen(request({ body: { actor: STAFF }, secret: null }), context())).status).toBe(401);
    expect(solveFeedback).not.toHaveBeenCalled();
  });

  it("answer 404 for an id that is not a uuid, without touching the service", async () => {
    expect((await detail(request(), context("nope"))).status).toBe(404);
    expect((await solve(request({ body: { actor: STAFF } }), context("nope"))).status).toBe(404);
    expect(getOpsFeedback).not.toHaveBeenCalled();
    expect(solveFeedback).not.toHaveBeenCalled();
  });
});

describe("GET /api/internal/feedback/[id]", () => {
  it("returns the message, and 404 when it is gone", async () => {
    const found = await detail(request(), context());
    expect(found.status).toBe(200);
    expect(await found.json()).toEqual({ id: ID });

    vi.mocked(getOpsFeedback).mockResolvedValue(null);
    expect((await detail(request(), context())).status).toBe(404);
  });

  it("never marks the message read", async () => {
    await detail(request(), context());
    expect(markFeedbackRead).not.toHaveBeenCalled();
  });
});

describe("POST /api/internal/feedback/[id]/read", () => {
  it("marks the message read and answers ok", async () => {
    const response = await read(request({ body: { actor: STAFF } }), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(markFeedbackRead).toHaveBeenCalledWith({}, ID);
  });

  it("answers 404 when the message is gone", async () => {
    vi.mocked(markFeedbackRead).mockResolvedValue("not_found");
    expect((await read(request({ body: {} }), context())).status).toBe(404);
  });
});

describe("POST /api/internal/feedback/[id]/solve", () => {
  it("solves as the staff member in the body and logs them", async () => {
    const response = await solve(request({ body: { actor: ` ${STAFF} ` } }), context());
    expect(response.status).toBe(200);
    expect(solveFeedback).toHaveBeenCalledWith({}, ID, STAFF);
    expect(String(vi.mocked(console.log).mock.calls[0]?.[0])).toContain(`"actor":"${STAFF}"`);
  });

  it("falls back to the x-ops-actor header", async () => {
    await solve(request({ body: {}, headers: { "x-ops-actor": STAFF } }), context());
    expect(solveFeedback).toHaveBeenCalledWith({}, ID, STAFF);
  });

  it("refuses without a staff email", async () => {
    expect((await solve(request({ body: {} }), context())).status).toBe(400);
    expect(solveFeedback).not.toHaveBeenCalled();
  });

  it("maps not_found to 404 and already_solved to 409", async () => {
    vi.mocked(solveFeedback).mockResolvedValue("not_found");
    expect((await solve(request({ body: { actor: STAFF } }), context())).status).toBe(404);
    vi.mocked(solveFeedback).mockResolvedValue("already_solved");
    const conflict = await solve(request({ body: { actor: STAFF } }), context());
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({ error: "already_solved" });
  });
});

describe("POST /api/internal/feedback/[id]/reopen", () => {
  it("reopens and answers ok", async () => {
    expect((await reopen(request({ body: { actor: STAFF } }), context())).status).toBe(200);
    expect(reopenFeedback).toHaveBeenCalledWith({}, ID);
  });

  it("maps not_solved to 409", async () => {
    vi.mocked(reopenFeedback).mockResolvedValue("not_solved");
    expect((await reopen(request({ body: { actor: STAFF } }), context())).status).toBe(409);
  });
});

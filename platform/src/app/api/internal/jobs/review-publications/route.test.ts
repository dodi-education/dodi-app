import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ serviceClient: vi.fn(() => ({})) }));
vi.mock("@/services/publication-review", () => ({
  processPendingPublications: vi.fn(),
}));

import { processPendingPublications } from "@/services/publication-review";

import { GET, POST } from "./route";

const URL = "https://platform.dodi.app/api/internal/jobs/review-publications";

const RUN_RESULT = {
  disabled: false,
  processed: 2,
  approved: 1,
  rejected: 1,
  skipped: 0,
  errors: 0,
};

beforeEach(() => {
  delete process.env.OPS_SECRET;
  delete process.env.CRON_SECRET;
  vi.mocked(processPendingPublications).mockReset();
  vi.mocked(processPendingPublications).mockResolvedValue(RUN_RESULT);
});

describe("POST /api/internal/jobs/review-publications auth", () => {
  it("fails closed when neither secret is configured", async () => {
    const res = await POST(
      new Request(URL, {
        method: "POST",
        headers: { "x-ops-secret": "anything" },
      }),
    );
    expect(res.status).toBe(401);
    expect(processPendingPublications).not.toHaveBeenCalled();
  });

  it("rejects a wrong ops secret", async () => {
    process.env.OPS_SECRET = "right";
    const res = await POST(
      new Request(URL, { method: "POST", headers: { "x-ops-secret": "wrong" } }),
    );
    expect(res.status).toBe(401);
  });

  it("accepts the ops secret and returns the run result", async () => {
    process.env.OPS_SECRET = "right";
    const res = await POST(
      new Request(URL, { method: "POST", headers: { "x-ops-secret": "right" } }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(RUN_RESULT);
  });

  it("a valid CRON_SECRET bearer does not open the x-ops-secret door and vice versa", async () => {
    process.env.OPS_SECRET = "review";
    process.env.CRON_SECRET = "cron";
    const res = await POST(
      new Request(URL, {
        method: "POST",
        headers: { "x-ops-secret": "cron", authorization: "Bearer review" },
      }),
    );
    expect(res.status).toBe(401);
  });
});

describe("GET /api/internal/jobs/review-publications (Vercel cron)", () => {
  it("accepts the cron bearer token", async () => {
    process.env.CRON_SECRET = "cron-secret";
    const res = await GET(
      new Request(URL, { headers: { authorization: "Bearer cron-secret" } }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(RUN_RESULT);
  });

  it("rejects a wrong bearer", async () => {
    process.env.CRON_SECRET = "cron-secret";
    const res = await GET(
      new Request(URL, { headers: { authorization: "Bearer nope" } }),
    );
    expect(res.status).toBe(401);
  });
});

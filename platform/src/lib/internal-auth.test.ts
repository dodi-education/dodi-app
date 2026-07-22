import { beforeEach, describe, expect, it } from "vitest";

import { isInternalAuthorized } from "./internal-auth";

const BASE = "https://api.dodi.app";

function req(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`${BASE}${path}`, { headers });
}

beforeEach(() => {
  delete process.env.OPS_SECRET;
  delete process.env.CRON_SECRET;
});

describe("isInternalAuthorized", () => {
  it("fails closed with no secrets configured", () => {
    expect(
      isInternalAuthorized(
        req("/api/internal/publications", { "x-ops-secret": "anything" }),
      ),
    ).toBe(false);
  });

  it("accepts the ops secret on any internal path", () => {
    process.env.OPS_SECRET = "ops";
    for (const path of [
      "/api/internal/publications",
      "/api/internal/publications/abc/review",
      "/api/internal/publications/process",
      "/api/internal/future-endpoint",
    ]) {
      expect(isInternalAuthorized(req(path, { "x-ops-secret": "ops" }))).toBe(true);
    }
  });

  it("rejects a wrong ops secret", () => {
    process.env.OPS_SECRET = "ops";
    expect(
      isInternalAuthorized(
        req("/api/internal/publications", { "x-ops-secret": "nope" }),
      ),
    ).toBe(false);
  });

  it("accepts the cron bearer ONLY on the cron path", () => {
    process.env.CRON_SECRET = "cron";
    const headers = { authorization: "Bearer cron" };
    expect(
      isInternalAuthorized(req("/api/internal/publications/process", headers)),
    ).toBe(true);
    // A leaked cron secret must not open the rest of the internal surface.
    expect(isInternalAuthorized(req("/api/internal/publications", headers))).toBe(false);
    expect(
      isInternalAuthorized(req("/api/internal/publications/abc/review", headers)),
    ).toBe(false);
  });

  it("the two secrets are not interchangeable", () => {
    process.env.OPS_SECRET = "ops";
    process.env.CRON_SECRET = "cron";
    expect(
      isInternalAuthorized(
        req("/api/internal/publications/process", {
          "x-ops-secret": "cron",
          authorization: "Bearer ops",
        }),
      ),
    ).toBe(false);
  });
});

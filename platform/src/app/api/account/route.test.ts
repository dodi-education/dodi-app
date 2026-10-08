import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * DELETE /api/account: only a parent session can delete, the password is
 * re-checked (with a per-account attempt limit, since the in-process check
 * skips Better Auth's own limiter), and a deleted live Discover game rebuilds
 * the marketing site's catalogue.
 */

const { requireAuthMock, verifyPasswordMock, deleteAccountMock, rateLimitMock, rebuildMock } =
  vi.hoisted(() => ({
    requireAuthMock: vi.fn(),
    verifyPasswordMock: vi.fn(),
    deleteAccountMock: vi.fn(),
    rateLimitMock: vi.fn(),
    rebuildMock: vi.fn(),
  }));

vi.mock("@/lib/resolve-auth", () => ({ requireAuth: requireAuthMock }));
vi.mock("@/lib/auth", () => ({ verifySessionPassword: verifyPasswordMock }));
vi.mock("@/lib/db", () => ({ serviceDb: {} }));
vi.mock("@/lib/landing-rebuild", () => ({ triggerLandingRebuild: rebuildMock }));
vi.mock("@/lib/error-logs", () => ({
  serverErrorResponse: vi.fn(
    () => new Response(JSON.stringify({ error: "server" }), { status: 500 }),
  ),
}));
vi.mock("@/services/account-deletion", () => ({ deleteAccount: deleteAccountMock }));
vi.mock("@/services/rate-limits", () => ({ consumeRateLimit: rateLimitMock }));
vi.mock("@/services/accounts", () => ({}));

import { DELETE } from "./route";

function deleteRequest(body: unknown): Request {
  return new Request("https://platform.test/api/account", {
    method: "DELETE",
    headers: { "content-type": "application/json", authorization: "Bearer token" },
    body: JSON.stringify(body),
  });
}

describe("DELETE /api/account", () => {
  beforeEach(() => {
    requireAuthMock.mockReset().mockResolvedValue({ accountId: "acc-1", db: {}, via: "user" });
    verifyPasswordMock.mockReset().mockResolvedValue(true);
    deleteAccountMock.mockReset().mockResolvedValue({ hadLivePublications: false });
    rateLimitMock
      .mockReset()
      .mockResolvedValue({ allowed: true, count: 1, limit: 5, resetAt: new Date(Date.now() + 60_000) });
    rebuildMock.mockReset().mockResolvedValue(undefined);
  });

  it("deletes the account after the password checks out", async () => {
    const res = await DELETE(deleteRequest({ password: "correct horse" }));

    expect(res.status).toBe(200);
    expect(verifyPasswordMock).toHaveBeenCalledWith(expect.any(Headers), "correct horse");
    expect(deleteAccountMock).toHaveBeenCalledWith({}, "acc-1");
    expect(rebuildMock).not.toHaveBeenCalled();
  });

  it("rebuilds the marketing catalogue when a live game went with the account", async () => {
    deleteAccountMock.mockResolvedValue({ hadLivePublications: true });

    const res = await DELETE(deleteRequest({ password: "correct horse" }));

    expect(res.status).toBe(200);
    expect(rebuildMock).toHaveBeenCalledOnce();
  });

  it("refuses a wrong password without deleting", async () => {
    verifyPasswordMock.mockResolvedValue(false);

    const res = await DELETE(deleteRequest({ password: "nope" }));

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "WRONG_PASSWORD" });
    expect(deleteAccountMock).not.toHaveBeenCalled();
  });

  it("stops checking passwords once the attempt limit is used up", async () => {
    rateLimitMock.mockResolvedValue({
      allowed: false,
      count: 6,
      limit: 5,
      resetAt: new Date(Date.now() + 90_000),
    });

    const res = await DELETE(deleteRequest({ password: "guess" }));

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("90");
    expect(verifyPasswordMock).not.toHaveBeenCalled();
    expect(deleteAccountMock).not.toHaveBeenCalled();
  });

  it("refuses device tokens", async () => {
    requireAuthMock.mockResolvedValue({ accountId: "acc-1", db: {}, via: "device" });

    const res = await DELETE(deleteRequest({ password: "correct horse" }));

    expect(res.status).toBe(403);
    expect(deleteAccountMock).not.toHaveBeenCalled();
  });

  it("requires a password", async () => {
    const res = await DELETE(deleteRequest({}));

    expect(res.status).toBe(400);
    expect(deleteAccountMock).not.toHaveBeenCalled();
  });

  it("answers 404 when the account is already gone", async () => {
    deleteAccountMock.mockResolvedValue(null);

    const res = await DELETE(deleteRequest({ password: "correct horse" }));

    expect(res.status).toBe(404);
  });
});

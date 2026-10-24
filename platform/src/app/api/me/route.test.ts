import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * DELETE /api/me: a person deletes their own profile, with or without an
 * account, after re-entering the password; never while they own an account.
 */

const {
  requireLoginMock,
  verifyPasswordMock,
  deleteLoginMock,
  firstAccountMock,
  rateLimitMock,
  LoginDeletionError,
} = vi.hoisted(() => ({
  requireLoginMock: vi.fn(),
  verifyPasswordMock: vi.fn(),
  deleteLoginMock: vi.fn(),
  firstAccountMock: vi.fn(),
  rateLimitMock: vi.fn(),
  LoginDeletionError: class LoginDeletionError extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  },
}));

vi.mock("@/lib/resolve-auth", () => ({ requireLogin: requireLoginMock }));
vi.mock("@/lib/auth", () => ({ verifySessionPassword: verifyPasswordMock }));
vi.mock("@/lib/db", () => ({ serviceDb: {} }));
vi.mock("@/lib/error-logs", () => ({
  serverErrorResponse: vi.fn(
    () => new Response(JSON.stringify({ error: "server" }), { status: 500 }),
  ),
}));
vi.mock("@/services/account-deletion", () => ({
  LoginDeletionError,
  deleteLogin: deleteLoginMock,
}));
vi.mock("@/services/account-members", () => ({ firstAccountOf: firstAccountMock }));
vi.mock("@/services/rate-limits", () => ({ consumeRateLimit: rateLimitMock }));

import { DELETE } from "./route";

function deleteRequest(body: unknown): Request {
  return new Request("https://platform.test/api/me", {
    method: "DELETE",
    headers: { "content-type": "application/json", authorization: "Bearer token" },
    body: JSON.stringify(body),
  });
}

describe("DELETE /api/me", () => {
  beforeEach(() => {
    requireLoginMock.mockReset().mockResolvedValue({
      userId: "user-1",
      sessionId: "session-1",
      email: "a@example.com",
      emailVerified: true,
    });
    verifyPasswordMock.mockReset().mockResolvedValue(true);
    deleteLoginMock.mockReset().mockResolvedValue(true);
    firstAccountMock.mockReset().mockResolvedValue("acc-1");
    rateLimitMock
      .mockReset()
      .mockResolvedValue({ allowed: true, count: 1, limit: 5, resetAt: new Date(Date.now() + 60_000) });
  });

  it("deletes the profile after the password checks out", async () => {
    const res = await DELETE(deleteRequest({ password: "correct horse" }));

    expect(res.status).toBe(200);
    expect(rateLimitMock).toHaveBeenCalledWith({}, expect.objectContaining({ accountId: "acc-1" }));
    expect(deleteLoginMock).toHaveBeenCalledWith({}, "user-1");
  });

  it("works for a profile without any account", async () => {
    firstAccountMock.mockResolvedValue(null);

    const res = await DELETE(deleteRequest({ password: "correct horse" }));

    expect(res.status).toBe(200);
    expect(rateLimitMock).not.toHaveBeenCalled();
    expect(deleteLoginMock).toHaveBeenCalledWith({}, "user-1");
  });

  it("refuses while the profile still owns an account", async () => {
    deleteLoginMock.mockRejectedValue(new LoginDeletionError("owns_account"));

    const res = await DELETE(deleteRequest({ password: "correct horse" }));

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "OWNS_ACCOUNT" });
  });

  it("refuses a wrong password without deleting", async () => {
    verifyPasswordMock.mockResolvedValue(false);

    const res = await DELETE(deleteRequest({ password: "nope" }));

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "WRONG_PASSWORD" });
    expect(deleteLoginMock).not.toHaveBeenCalled();
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
    expect(verifyPasswordMock).not.toHaveBeenCalled();
    expect(deleteLoginMock).not.toHaveBeenCalled();
  });

  it("requires a password", async () => {
    const res = await DELETE(deleteRequest({}));

    expect(res.status).toBe(400);
    expect(deleteLoginMock).not.toHaveBeenCalled();
  });
});

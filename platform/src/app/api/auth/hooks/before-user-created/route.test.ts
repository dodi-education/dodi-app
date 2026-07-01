import { beforeEach, describe, expect, it, vi } from "vitest";
import { Webhook } from "standardwebhooks";

// Keep the logger quiet / off the filesystem during tests.
vi.mock("@/logger", () => ({
  createLogger: () => ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    time: () => () => {},
  }),
}));
vi.mock("@/lib/supabase", () => ({ serviceClient: vi.fn(() => ({})) }));
vi.mock("@/services/registration", () => ({
  getRegistrationMode: vi.fn(),
  isInviteCodeActive: vi.fn(),
}));

import { getRegistrationMode, isInviteCodeActive } from "@/services/registration";

import { POST } from "./route";

const B64_SECRET = Buffer.from("dodi-test-secret-0123456789abcdef").toString(
  "base64",
);
const FULL_SECRET = `v1,whsec_${B64_SECRET}`;
const URL = "https://api.dodi.app/api/auth/hooks/before-user-created";

/** Build a request signed the way GoTrue signs before_user_created payloads. */
function signedRequest(body: unknown): Request {
  const payload = JSON.stringify(body);
  const wh = new Webhook(B64_SECRET);
  const id = "msg_test";
  const timestamp = new Date();
  const signature = wh.sign(id, timestamp, payload);
  return new Request(URL, {
    method: "POST",
    headers: {
      "webhook-id": id,
      "webhook-timestamp": Math.floor(timestamp.getTime() / 1000).toString(),
      "webhook-signature": signature,
      "content-type": "application/json",
    },
    body: payload,
  });
}

beforeEach(() => {
  process.env.BEFORE_USER_CREATED_HOOK_SECRET = FULL_SECRET;
  vi.mocked(getRegistrationMode).mockReset();
  vi.mocked(isInviteCodeActive).mockReset();
});

describe("before_user_created hook", () => {
  it("rejects a request with a bad/missing signature (401)", async () => {
    vi.mocked(getRegistrationMode).mockReturnValue("open");
    const res = await POST(
      new Request(URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(res.status).toBe(401);
  });

  it("500s when the hook secret is not configured", async () => {
    delete process.env.BEFORE_USER_CREATED_HOOK_SECRET;
    const res = await POST(signedRequest({ user: { user_metadata: {} } }));
    expect(res.status).toBe(500);
  });

  it("allows signup in open mode", async () => {
    vi.mocked(getRegistrationMode).mockReturnValue("open");
    const res = await POST(
      signedRequest({ user: { email: "a@b.c", user_metadata: {} } }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  it("rejects signup in closed mode", async () => {
    vi.mocked(getRegistrationMode).mockReturnValue("closed");
    const res = await POST(
      signedRequest({ user: { email: "a@b.c", user_metadata: {} } }),
    );
    const body = (await res.json()) as { error: { http_code: number } };
    expect(body.error.http_code).toBe(403);
    expect(isInviteCodeActive).not.toHaveBeenCalled();
  });

  it("rejects invite mode with no code (without a db call)", async () => {
    vi.mocked(getRegistrationMode).mockReturnValue("invite");
    const res = await POST(signedRequest({ user: { user_metadata: {} } }));
    const body = (await res.json()) as { error: { http_code: number } };
    expect(body.error.http_code).toBe(403);
    expect(isInviteCodeActive).not.toHaveBeenCalled();
  });

  it("rejects invite mode with an invalid code", async () => {
    vi.mocked(getRegistrationMode).mockReturnValue("invite");
    vi.mocked(isInviteCodeActive).mockResolvedValue(false);
    const res = await POST(
      signedRequest({ user: { user_metadata: { invite_code: "NOPE" } } }),
    );
    const body = (await res.json()) as { error: { http_code: number } };
    expect(body.error.http_code).toBe(403);
  });

  it("allows invite mode with a valid code", async () => {
    vi.mocked(getRegistrationMode).mockReturnValue("invite");
    vi.mocked(isInviteCodeActive).mockResolvedValue(true);
    const res = await POST(
      signedRequest({ user: { user_metadata: { invite_code: "DODI-BETA" } } }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    expect(isInviteCodeActive).toHaveBeenCalledWith(
      expect.anything(),
      "DODI-BETA",
    );
  });
});

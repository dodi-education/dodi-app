import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { bearer } from "better-auth/plugins";
import { describe, expect, it } from "vitest";

import { AUTH_RATE_LIMIT } from "./auth-rate-limit";

/**
 * The production rate-limit rules against a throwaway in-memory Better Auth.
 *
 * Regression: the web middleware validates the session with GET /get-session
 * on every navigation and every RSC prefetch (~34 requests per /parent/kids
 * render). Better Auth's default 100-per-10s bucket, whose count only resets
 * after 10 quiet seconds, answered request #101 of one parent's create/delete
 * cycle with 429, and the middleware sent the still-signed-in parent to /login.
 */

const BASE = "http://localhost:3001";

// Better Auth keeps its memory store at module scope, shared by every instance
// in this file, so each test uses its own client addresses.

function makeAuth() {
  return betterAuth({
    baseURL: BASE,
    secret: "test-secret-test-secret-test-secret-1234",
    database: memoryAdapter({
      user: [],
      session: [],
      account: [],
      verification: [],
    }),
    rateLimit: AUTH_RATE_LIMIT,
    plugins: [bearer()],
    logger: { disabled: true },
  });
}

function getSession(
  auth: ReturnType<typeof makeAuth>,
  ip: string,
): Promise<Response> {
  return auth.handler(
    new Request(`${BASE}/api/auth/get-session`, {
      headers: {
        authorization: "Bearer not-a-real-token",
        "x-forwarded-for": ip,
      },
    }),
  );
}

async function statuses(
  auth: ReturnType<typeof makeAuth>,
  ip: string,
  count: number,
): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push((await getSession(auth, ip)).status);
  return out;
}

describe("AUTH_RATE_LIMIT", () => {
  it("lets one client navigate well past Better Auth's default 100 session checks", async () => {
    const auth = makeAuth();
    const codes = await statuses(auth, "203.0.113.1", 300);
    expect(codes.filter((c) => c === 429)).toHaveLength(0);
  });

  it("still caps a single client hammering /get-session", async () => {
    const auth = makeAuth();
    const codes = await statuses(auth, "203.0.113.2", 1001);
    expect(codes.slice(0, 1000).every((c) => c !== 429)).toBe(true);
    expect(codes[1000]).toBe(429);
  });

  it("keeps a separate bucket per client IP", async () => {
    const auth = makeAuth();
    await statuses(auth, "203.0.113.3", 1001);
    expect((await getSession(auth, "203.0.113.3")).status).toBe(429);
    expect((await getSession(auth, "198.51.100.23")).status).not.toBe(429);
  });

  it("keeps the strict sign-in limit", async () => {
    const auth = makeAuth();
    const signIn = () =>
      auth.handler(
        new Request(`${BASE}/api/auth/sign-in/email`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: BASE,
            "x-forwarded-for": "203.0.113.4",
          },
          body: JSON.stringify({
            email: "nobody@example.com",
            password: "wrong-password",
          }),
        }),
      );
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push((await signIn()).status);
    expect(codes.slice(0, 10).every((c) => c !== 429)).toBe(true);
    expect(codes[10]).toBe(429);
  });
});

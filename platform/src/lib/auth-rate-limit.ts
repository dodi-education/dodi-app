import type { BetterAuthOptions } from "better-auth";

/**
 * Better Auth's request rate limit (`rateLimit` in lib/auth.ts). Kept in its own
 * module so tests can run these exact rules against a throwaway instance.
 *
 * Buckets are keyed by client IP + path, read from `x-forwarded-for`: Caddy
 * stamps the browser's address on public traffic, and the internal callers
 * (web middleware, ai) forward the client address they received.
 */
export const AUTH_RATE_LIMIT = {
  enabled: true,
  customRules: {
    "/sign-in/email": { window: 60, max: 10 },
    "/sign-in/email-otp": { window: 60, max: 10 },
    "/email-otp/send-verification-otp": { window: 3600, max: 6 },
    "/email-otp/verify-email": { window: 60, max: 10 },
    "/password/verify": { window: 60, max: 10 },
    "/password/set": { window: 60, max: 10 },
    // The web middleware checks the session on every navigation and prefetch
    // (~34 per page render), so the default 100 logged active parents out.
    // 1000 per IP still caps a flooding client.
    "/get-session": { window: 10, max: 1000 },
  },
} satisfies BetterAuthOptions["rateLimit"];

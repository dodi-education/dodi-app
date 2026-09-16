import { clientIp } from "@/lib/client-ip";

/**
 * Bot protection for the auth front doors (sign-up, sign-in, password reset)
 * with Cloudflare Turnstile.
 *
 * The browser solves a (mostly invisible) Turnstile challenge and sends the
 * resulting single-use token in the `x-captcha-response` header. Two server
 * paths check it:
 *
 *  - Better Auth's own endpoints (`/sign-in/email`, the OTP sender, …) via the
 *    library's `captcha` plugin, which only fires for HTTP requests through the
 *    /api/auth handler, never for in-process `auth.api.*` calls.
 *  - `POST /api/auth/register`, our sign-up front door: it calls
 *    `auth.api.signUpEmail` in-process, so it verifies the token itself with
 *    `verifyCaptchaRequest` before the call. A token is spent on first
 *    verification, so a request must be checked exactly once.
 *
 * Configuration is the platform's alone: TURNSTILE_SITE_KEY (public, handed to
 * the browser by GET /api/auth/captcha-config) and TURNSTILE_SECRET_KEY
 * (server only). Both set ⇒ enforced; neither ⇒ off (self-host default). Only
 * one set is a misconfiguration and stays off, with a warning, so a half-set
 * pair can never lock parents out.
 */

export const CAPTCHA_HEADER = "x-captcha-response";

export const CAPTCHA_PROVIDER = "cloudflare-turnstile";

/**
 * Better Auth paths (relative to /api/auth) that require a token. The verify
 * steps (`/email-otp/verify-email`, `/sign-in/email-otp`) are left out: they are
 * already bounded by the 5-attempt OTP limit and the per-path rate limit, and a
 * token per attempt would make code entry needlessly slow.
 */
export const CAPTCHA_PROTECTED_AUTH_PATHS: readonly string[] = [
  "/sign-up/email",
  "/sign-in/email",
  "/email-otp/send-verification-otp",
  "/request-password-reset",
  "/forget-password",
];

const SITE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const SITE_VERIFY_TIMEOUT_MS = 10_000;

export interface CaptchaConfig {
  siteKey: string;
  secretKey: string;
}

let warnedPartialConfig = false;

/** The Turnstile key pair from the environment, or null when captcha is off. */
export function getCaptchaConfig(): CaptchaConfig | null {
  const siteKey = process.env.TURNSTILE_SITE_KEY?.trim() ?? "";
  const secretKey = process.env.TURNSTILE_SECRET_KEY?.trim() ?? "";
  if (siteKey && secretKey) return { siteKey, secretKey };
  if ((siteKey || secretKey) && !warnedPartialConfig) {
    warnedPartialConfig = true;
    console.warn(
      "[captcha] Only one of TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY is set; bot protection stays disabled until both are.",
    );
  }
  return null;
}

/** Test seam: forget that the partial-config warning was already emitted. */
export function resetCaptchaWarnings(): void {
  warnedPartialConfig = false;
}

/**
 * Rejection shapes mirror Better Auth's captcha plugin (same codes, messages
 * and statuses), so the web client handles one contract for both paths.
 */
export type CaptchaVerdict =
  | { ok: true }
  | {
      ok: false;
      code: "MISSING_RESPONSE" | "VERIFICATION_FAILED" | "UNKNOWN_ERROR";
      message: string;
      status: 400 | 403 | 500;
    };

const MISSING_RESPONSE: CaptchaVerdict = {
  ok: false,
  code: "MISSING_RESPONSE",
  message: "Missing CAPTCHA response",
  status: 400,
};
const VERIFICATION_FAILED: CaptchaVerdict = {
  ok: false,
  code: "VERIFICATION_FAILED",
  message: "Captcha verification failed",
  status: 403,
};
const UNKNOWN_ERROR: CaptchaVerdict = {
  ok: false,
  code: "UNKNOWN_ERROR",
  message: "Something went wrong",
  status: 500,
};

interface SiteVerifyResponse {
  success?: boolean;
  "error-codes"?: string[];
}

/**
 * Verify a Turnstile token with Cloudflare's siteverify endpoint. Fails closed:
 * an unreachable or malformed siteverify answer is a 500 `UNKNOWN_ERROR`, not
 * a pass.
 */
export async function verifyCaptchaToken(
  token: string,
  config: CaptchaConfig,
  remoteIp?: string | null,
): Promise<CaptchaVerdict> {
  try {
    const res = await fetch(SITE_VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        secret: config.secretKey,
        response: token,
        ...(remoteIp ? { remoteip: remoteIp } : {}),
      }),
      signal: AbortSignal.timeout(SITE_VERIFY_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error("[captcha] siteverify answered", res.status);
      return UNKNOWN_ERROR;
    }
    const data = (await res.json()) as SiteVerifyResponse;
    return data.success === true ? { ok: true } : VERIFICATION_FAILED;
  } catch (error) {
    console.error("[captcha] siteverify unreachable", error);
    return UNKNOWN_ERROR;
  }
}

/** Check the `x-captcha-response` header of an incoming request. */
export async function verifyCaptchaRequest(
  request: Request,
  config: CaptchaConfig,
): Promise<CaptchaVerdict> {
  const token = request.headers.get(CAPTCHA_HEADER)?.trim();
  if (!token) return MISSING_RESPONSE;
  return verifyCaptchaToken(token, config, clientIp(request));
}

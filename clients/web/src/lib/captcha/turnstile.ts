/**
 * Cloudflare Turnstile: script loader + the slice of its browser API we use.
 * Loaded on demand (only when the platform reports captcha as enabled), once
 * per page, in explicit-render mode so the widget component controls where and
 * when a challenge runs.
 */

export const TURNSTILE_SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/** Header the platform reads the token from (Better Auth captcha contract). */
export const CAPTCHA_HEADER = "x-captcha-response";

/** Error codes the platform answers with when a token is missing or rejected. */
const CAPTCHA_ERROR_CODES = new Set([
  "MISSING_RESPONSE",
  "VERIFICATION_FAILED",
]);

/** True for an auth error caused by the captcha check (not by credentials). */
export function isCaptchaError(code: string | undefined | null): boolean {
  return !!code && CAPTCHA_ERROR_CODES.has(code);
}

/** Request headers carrying the token; empty when captcha is off (token null). */
export function captchaHeaders(token: string | null): Record<string, string> {
  return token ? { [CAPTCHA_HEADER]: token } : {};
}

export interface TurnstileRenderOptions {
  sitekey: string;
  action?: string;
  /** "execute": the challenge only runs once `turnstile.execute()` is called. */
  execution?: "render" | "execute";
  /** "interaction-only": the widget stays invisible unless the visitor must act. */
  appearance?: "always" | "execute" | "interaction-only";
  size?: "normal" | "flexible" | "compact";
  theme?: "light" | "dark" | "auto";
  language?: string;
  callback?: (token: string) => void;
  /** Return true to mark the error handled (suppresses Turnstile's console log). */
  "error-callback"?: (errorCode: string) => boolean | void;
  "expired-callback"?: () => void;
  "timeout-callback"?: () => void;
}

export interface TurnstileApi {
  render(
    container: HTMLElement,
    options: TurnstileRenderOptions,
  ): string | undefined;
  execute(widgetId: string): void;
  reset(widgetId?: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | null = null;

/**
 * Resolve the Turnstile API, injecting the script on first use. A failed load
 * (offline, blocked by an extension) rejects and clears the cache so the next
 * attempt injects a fresh tag instead of waiting on a dead one.
 */
export function loadTurnstile(): Promise<TurnstileApi> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Turnstile needs a browser"));
  }
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (loading) return loading;

  loading = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("Turnstile script loaded without its API"));
    };
    script.onerror = () => {
      script.remove();
      reject(new Error("Turnstile script failed to load"));
    };
    document.head.appendChild(script);
  });
  loading.catch(() => {
    loading = null;
  });
  return loading;
}

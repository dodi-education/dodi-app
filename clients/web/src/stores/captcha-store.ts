/**
 * Client cache of GET /api/auth/captcha-config: whether the platform demands a
 * Turnstile token on the auth front doors, and the public site key to render
 * the widget with. One single-flight fetch shared by every auth form that
 * mounts (login page, login dialog, register, reset, finish-setup).
 */
import { create } from "zustand";

import { dodi } from "@/lib/api";

export type CaptchaConfig =
  { provider: "cloudflare-turnstile"; siteKey: string } | { provider: null };

const CAPTCHA_OFF: CaptchaConfig = { provider: null };

interface CaptchaState {
  /** Null until the first successful load. */
  config: CaptchaConfig | null;
  /** Resolve the config, fetching it once. Never rejects: see below. */
  load: () => Promise<CaptchaConfig>;
  /** Drop the cache (tests). */
  reset: () => void;
}

// Single-flight guard: forms mounting together ride one fetch.
let inFlight: Promise<CaptchaConfig> | null = null;

export const useCaptchaStore = create<CaptchaState>((set, get) => ({
  config: null,

  load: async () => {
    const cached = get().config;
    if (cached) return cached;
    if (inFlight) return inFlight;

    inFlight = (async () => {
      try {
        const res = await dodi.request("/api/auth/captcha-config");
        if (!res.ok) return CAPTCHA_OFF;
        const data = (await res.json()) as Partial<CaptchaConfig>;
        const config: CaptchaConfig =
          data.provider === "cloudflare-turnstile" &&
          typeof data.siteKey === "string" &&
          data.siteKey
            ? { provider: "cloudflare-turnstile", siteKey: data.siteKey }
            : CAPTCHA_OFF;
        set({ config });
        return config;
      } catch {
        // Platform unreachable: answer "off" WITHOUT caching, so the auth call
        // itself surfaces the real failure and the next mount retries. If
        // captcha is actually on, the platform rejects with MISSING_RESPONSE
        // and the form shows the captcha error, which a retry clears.
        return CAPTCHA_OFF;
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  },

  reset: () => {
    inFlight = null;
    set({ config: null });
  },
}));

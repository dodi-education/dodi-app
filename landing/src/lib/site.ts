/**
 * Static site configuration. URLs are env-driven with production fallbacks so the
 * build works without a local `.env`. The landing is decoupled from the app, so it
 * only needs to know the app's public origin to link to it (login / register).
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dodi.app";
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.dodi.app";

export const locales = ["en", "de"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

/** The URL path each locale is served at (English unprefixed, German under /de). */
export const localePath: Record<Locale, string> = { en: "/", de: "/de" };

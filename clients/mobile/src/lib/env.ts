/** Build-time configuration (EXPO_PUBLIC_*, inlined by Expo from .env.local). */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";
export const DODI_AI_URL = process.env.EXPO_PUBLIC_DODI_AI_URL || null;
export const SITE_URL = process.env.EXPO_PUBLIC_SITE_URL || "https://www.dodi.app";
/** Origin the captcha widget runs under (a hostname the Turnstile key allows). */
export const CAPTCHA_ORIGIN = process.env.EXPO_PUBLIC_CAPTCHA_ORIGIN || SITE_URL;

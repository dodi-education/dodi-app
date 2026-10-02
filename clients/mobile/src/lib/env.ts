/** Build-time configuration (EXPO_PUBLIC_*, inlined by Expo from .env.local). */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";
export const DODI_AI_URL = process.env.EXPO_PUBLIC_DODI_AI_URL || null;
/** The web app origin: friend QR codes encode `{APP_URL}/friends?add=<code>`, like the web. */
export const APP_URL = process.env.EXPO_PUBLIC_APP_URL || "https://app.dodi.app";
export const SITE_URL = process.env.EXPO_PUBLIC_SITE_URL || "https://www.dodi.app";
/** Origin the captcha widget runs under (a hostname the Turnstile key allows). */
export const CAPTCHA_ORIGIN = process.env.EXPO_PUBLIC_CAPTCHA_ORIGIN || SITE_URL;

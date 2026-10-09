/**
 * Custom request headers the clients send to the platform. Browsers only send
 * them cross-origin if the platform's CORS preflight allows them (see
 * platform/src/middleware.ts and its test), so every one is listed here.
 */

/** This client's device id, so the Access list can mark `is_current`. */
export const CURRENT_DEVICE_HEADER = "x-dodi-device-id";

/** Turnstile token on the auth front doors. */
export const CAPTCHA_HEADER = "x-captcha-response";

export const CLIENT_REQUEST_HEADERS = [CURRENT_DEVICE_HEADER, CAPTCHA_HEADER] as const;

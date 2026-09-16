import { describe, expect, it } from "vitest";

import { CAPTCHA_HEADER, captchaHeaders, isCaptchaError } from "./turnstile";

describe("captcha request helpers", () => {
  it("recognises the platform's captcha rejection codes only", () => {
    expect(isCaptchaError("MISSING_RESPONSE")).toBe(true);
    expect(isCaptchaError("VERIFICATION_FAILED")).toBe(true);
    expect(isCaptchaError("INVALID_EMAIL_OR_PASSWORD")).toBe(false);
    expect(isCaptchaError("EMAIL_NOT_VERIFIED")).toBe(false);
    expect(isCaptchaError(undefined)).toBe(false);
    expect(isCaptchaError(null)).toBe(false);
    expect(isCaptchaError("")).toBe(false);
  });

  it("builds the token header, or nothing when captcha is off", () => {
    expect(captchaHeaders("tok")).toEqual({ [CAPTCHA_HEADER]: "tok" });
    expect(CAPTCHA_HEADER).toBe("x-captcha-response");
    expect(captchaHeaders(null)).toEqual({});
  });
});

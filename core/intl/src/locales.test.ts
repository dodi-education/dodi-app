import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  isSupportedLocale,
  normalizeLocale,
} from "./locales";

describe("SUPPORTED_LOCALES", () => {
  it("contains the default locale", () => {
    expect(SUPPORTED_LOCALES).toContain(DEFAULT_LOCALE);
  });
});

describe("isSupportedLocale", () => {
  it("accepts every supported locale", () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(isSupportedLocale(locale)).toBe(true);
    }
  });

  it("rejects unknown values and non-strings", () => {
    expect(isSupportedLocale("fr")).toBe(false);
    expect(isSupportedLocale("EN")).toBe(false);
    expect(isSupportedLocale(null)).toBe(false);
    expect(isSupportedLocale(42)).toBe(false);
  });
});

describe("normalizeLocale", () => {
  it("collapses BCP-47 tags onto their short code", () => {
    expect(normalizeLocale("de-DE")).toBe("de");
    expect(normalizeLocale("de-AT")).toBe("de");
    expect(normalizeLocale("en-GB")).toBe("en");
  });

  it("is case-insensitive", () => {
    expect(normalizeLocale("DE")).toBe("de");
    expect(normalizeLocale("En")).toBe("en");
  });

  it("falls back to the default locale", () => {
    expect(normalizeLocale("fr")).toBe(DEFAULT_LOCALE);
    expect(normalizeLocale("")).toBe(DEFAULT_LOCALE);
    expect(normalizeLocale(null)).toBe(DEFAULT_LOCALE);
    expect(normalizeLocale(undefined)).toBe(DEFAULT_LOCALE);
  });
});

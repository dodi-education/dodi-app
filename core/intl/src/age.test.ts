import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ageFromBirthdate, isTodayBirthday } from "./age";

// Pin "now" to local June 24, 2026 (constructed in local time so the assertions
// are timezone-independent across CI/dev machines).
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 5, 24, 12, 0, 0));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("ageFromBirthdate", () => {
  it("turns the age on the birthday", () => {
    expect(ageFromBirthdate("2018-06-24")).toBe(8);
  });

  it("has not yet turned the day before the birthday", () => {
    expect(ageFromBirthdate("2018-06-25")).toBe(7);
  });

  it("has already turned after the birthday", () => {
    expect(ageFromBirthdate("2018-06-23")).toBe(8);
  });

  it("returns null for empty/invalid/future", () => {
    expect(ageFromBirthdate(null)).toBeNull();
    expect(ageFromBirthdate("nope")).toBeNull();
    expect(ageFromBirthdate("2030-01-01")).toBeNull();
  });
});

describe("isTodayBirthday", () => {
  it("true on the month+day match", () => {
    expect(isTodayBirthday("2010-06-24")).toBe(true);
  });
  it("false otherwise", () => {
    expect(isTodayBirthday("2010-06-25")).toBe(false);
    expect(isTodayBirthday(null)).toBe(false);
  });
});

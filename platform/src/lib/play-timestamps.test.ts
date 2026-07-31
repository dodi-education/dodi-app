import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isPlausiblePlayTimestamp } from "./play-timestamps";

describe("isPlausiblePlayTimestamp", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("accepts now and recent past times", () => {
    expect(isPlausiblePlayTimestamp("2026-07-31T12:00:00Z")).toBe(true);
    expect(isPlausiblePlayTimestamp("2026-07-31T09:30:00Z")).toBe(true);
    expect(isPlausiblePlayTimestamp("2026-07-15T12:00:00Z")).toBe(true);
  });

  it("absorbs small clock skew but rejects real future times", () => {
    expect(isPlausiblePlayTimestamp("2026-07-31T12:04:00Z")).toBe(true);
    expect(isPlausiblePlayTimestamp("2026-07-31T12:06:00Z")).toBe(false);
  });

  it("rejects times older than the 30-day backlog window", () => {
    expect(isPlausiblePlayTimestamp("2026-07-02T12:00:00Z")).toBe(true);
    expect(isPlausiblePlayTimestamp("2026-06-30T12:00:00Z")).toBe(false);
  });

  it("rejects garbage", () => {
    expect(isPlausiblePlayTimestamp("not-a-date")).toBe(false);
    expect(isPlausiblePlayTimestamp("")).toBe(false);
  });
});

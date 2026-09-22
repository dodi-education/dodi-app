import { describe, expect, it } from "vitest";

import { fillDays, resolveOpsRange, type DailyPoint } from "./ops-range";

const NOW = new Date("2026-05-14T09:30:00Z");

describe("resolveOpsRange", () => {
  it("gives 7 day buckets ending with today", () => {
    const range = resolveOpsRange("7d", NOW);
    expect(range.days).toBe(7);
    expect(range.from).toBe("2026-05-08T00:00:00.000Z");
    // Exclusive end: start of tomorrow, so today is the last bucket.
    expect(range.to).toBe("2026-05-15T00:00:00.000Z");
    expect(fillDays(range, [])).toHaveLength(7);
  });

  it("30d is 30 day buckets", () => {
    const range = resolveOpsRange("30d", NOW);
    expect(range.days).toBe(30);
    expect(range.from).toBe("2026-04-15T00:00:00.000Z");
  });

  it("qtd starts at the first day of the current quarter", () => {
    const range = resolveOpsRange("qtd", NOW);
    expect(range.from).toBe("2026-04-01T00:00:00.000Z");
    expect(range.to).toBe("2026-05-15T00:00:00.000Z");
    expect(range.days).toBe(44);
  });

  it("the previous window has the same length and ends where the current starts", () => {
    for (const key of ["7d", "30d", "qtd"] as const) {
      const range = resolveOpsRange(key, NOW);
      expect(range.prevTo).toBe(range.from);
      const prevLength =
        new Date(range.prevTo).getTime() - new Date(range.prevFrom).getTime();
      const length = new Date(range.to).getTime() - new Date(range.from).getTime();
      expect(prevLength).toBe(length);
    }
  });
});

describe("fillDays", () => {
  it("zero-fills gaps and keeps the days in order", () => {
    const range = resolveOpsRange("7d", NOW);
    const rows: DailyPoint[] = [
      { day: "2026-05-10", value: 3 },
      { day: "2026-05-14", value: 7 },
    ];
    expect(fillDays(range, rows)).toEqual([
      { day: "2026-05-08", value: 0 },
      { day: "2026-05-09", value: 0 },
      { day: "2026-05-10", value: 3 },
      { day: "2026-05-11", value: 0 },
      { day: "2026-05-12", value: 0 },
      { day: "2026-05-13", value: 0 },
      { day: "2026-05-14", value: 7 },
    ]);
  });

  it("accepts full timestamps as the day key", () => {
    const range = resolveOpsRange("7d", NOW);
    const filled = fillDays(range, [
      { day: "2026-05-09T00:00:00.000Z", value: 2 },
    ]);
    expect(filled[1]).toEqual({ day: "2026-05-09", value: 2 });
  });
});

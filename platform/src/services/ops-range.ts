/**
 * The dashboard time range shared by every ops stats endpoint.
 *
 * SYNC TOUCHPOINT: dodi-com/core/ops-contract/src/range.ts
 *
 * The OSS platform cannot depend on the commercial contract package, so this
 * is a deliberate second copy of the same logic. Keep both sides identical:
 * the console builds `?range=<key>` from its copy and parses the echoed window
 * back through its schema, so any drift surfaces as a contract mismatch at the
 * boundary.
 *
 * Windows are whole UTC days: `to` is the start of tomorrow (exclusive) so
 * today is always the last bucket; `from` is `to - days`. The previous window
 * of equal length ends where the current one starts. Quarter-to-date runs from
 * the first day of the current quarter.
 */
import { z } from "zod/v4";

export const OPS_RANGE_KEYS = ["7d", "30d", "qtd"] as const;
export type OpsRangeKey = (typeof OPS_RANGE_KEYS)[number];
export const OpsRangeKeySchema = z.enum(OPS_RANGE_KEYS);

export interface OpsRange {
  key: OpsRangeKey;
  /** ISO timestamp, inclusive start of the window. */
  from: string;
  /** ISO timestamp, exclusive end of the window (start of tomorrow, UTC). */
  to: string;
  prevFrom: string;
  prevTo: string;
  /** Number of day buckets in the window. */
  days: number;
}

export interface DailyPoint {
  /** `YYYY-MM-DD` (UTC). */
  day: string;
  value: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

/** Lenient key coercion for query strings: anything unknown falls back to 30d. */
export function parseOpsRangeKey(value: unknown): OpsRangeKey {
  const parsed = OpsRangeKeySchema.safeParse(value);
  return parsed.success ? parsed.data : "30d";
}

export function resolveOpsRange(key: OpsRangeKey, now: Date = new Date()): OpsRange {
  const today = startOfUtcDay(now);
  const to = new Date(today.getTime() + DAY_MS);
  let from: Date;
  if (key === "qtd") {
    const quarterStartMonth = Math.floor(today.getUTCMonth() / 3) * 3;
    from = new Date(Date.UTC(today.getUTCFullYear(), quarterStartMonth, 1));
  } else {
    from = new Date(to.getTime() - (key === "7d" ? 7 : 30) * DAY_MS);
  }
  const days = Math.round((to.getTime() - from.getTime()) / DAY_MS);
  const prevTo = from;
  const prevFrom = new Date(from.getTime() - days * DAY_MS);
  return {
    key,
    from: from.toISOString(),
    to: to.toISOString(),
    prevFrom: prevFrom.toISOString(),
    prevTo: prevTo.toISOString(),
    days,
  };
}

/** Every day of the window, in order, with 0 where the query returned no row. */
export function fillDays(
  range: OpsRange,
  rows: readonly DailyPoint[],
): DailyPoint[] {
  const byDay = new Map(rows.map((r) => [r.day.slice(0, 10), r.value]));
  const start = new Date(range.from).getTime();
  const out: DailyPoint[] = [];
  for (let i = 0; i < range.days; i++) {
    const day = new Date(start + i * DAY_MS).toISOString().slice(0, 10);
    out.push({ day, value: byDay.get(day) ?? 0 });
  }
  return out;
}

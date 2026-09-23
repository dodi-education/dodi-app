import { sql } from "kysely";

import type { Db } from "@/lib/db";

/**
 * Per-account fixed-window rate limiting on `account_rate_limit_windows`.
 *
 * One atomic INSERT ... ON CONFLICT DO UPDATE ... RETURNING both counts the
 * call and reports the count, so concurrent requests can never slip past the
 * cap, and the state survives platform restarts (unlike an in-process map).
 * Callers pass `serviceDb`: the table is service-role only (dodi_app has no
 * privileges on it), and the query is scoped to the resolved account.
 *
 * Fixed windows are deliberately simple: a burst at a window edge can spend up
 * to 2x the limit across two windows, which is fine for cost caps on expensive
 * calls (renders, AI) where the point is bounding abuse, not shaping traffic.
 */

export interface RateLimitOptions {
  accountId: string;
  /** Which limited operation, e.g. "game_screenshot" (one counter per bucket). */
  bucket: string;
  /** Calls allowed per window. */
  limit: number;
  windowMs: number;
  /** Injectable clock (tests). */
  now?: Date;
}

export interface RateLimitResult {
  /** This call is within the limit (it has already been counted either way). */
  allowed: boolean;
  /** Calls in the current window, this one included. */
  count: number;
  limit: number;
  /** When the current window ends and the count starts over. */
  resetAt: Date;
}

/** Count one call against the account's window and say whether it was allowed. */
export async function consumeRateLimit(
  db: Db,
  { accountId, bucket, limit, windowMs, now = new Date() }: RateLimitOptions,
): Promise<RateLimitResult> {
  const windowStartMs = Math.floor(now.getTime() / windowMs) * windowMs;
  const windowStart = new Date(windowStartMs).toISOString();
  const { rows } = await sql<{ request_count: number }>`
    insert into public.account_rate_limit_windows (account_id, bucket, window_start, request_count)
    values (${accountId}, ${bucket}, ${windowStart}::timestamptz, 1)
    on conflict (account_id, bucket, window_start)
    do update set request_count = account_rate_limit_windows.request_count + 1
    returning request_count
  `.execute(db);
  const count = Number(rows[0]?.request_count ?? 1);
  return {
    allowed: count <= limit,
    count,
    limit,
    resetAt: new Date(windowStartMs + windowMs),
  };
}

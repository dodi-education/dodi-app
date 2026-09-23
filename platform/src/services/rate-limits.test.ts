import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestDb, type TestDatabase } from "../test-support/pglite-db";
import { consumeRateLimit } from "./rate-limits";

describe("consumeRateLimit", () => {
  let t: TestDatabase;
  let accountId: string;
  const HOUR = 3_600_000;
  const at = (iso: string) => new Date(iso);

  beforeAll(async () => {
    t = await createTestDb();
    accountId = await t.createAccount("limits@example.com");
  });

  afterAll(async () => {
    await t.close();
  });

  it("counts every call and refuses past the limit within one window", async () => {
    const opts = { accountId, bucket: "unit_a", limit: 2, windowMs: HOUR, now: at("2026-09-22T10:15:00Z") };
    const first = await consumeRateLimit(t.serviceDb, opts);
    const second = await consumeRateLimit(t.serviceDb, opts);
    const third = await consumeRateLimit(t.serviceDb, opts);
    expect([first.allowed, second.allowed, third.allowed]).toEqual([true, true, false]);
    expect([first.count, second.count, third.count]).toEqual([1, 2, 3]);
    expect(third.limit).toBe(2);
    // The window is floored to the hour, so it resets at 11:00.
    expect(third.resetAt.toISOString()).toBe("2026-09-22T11:00:00.000Z");
  });

  it("starts over in the next window", async () => {
    const base = { accountId, bucket: "unit_b", limit: 1, windowMs: HOUR };
    expect((await consumeRateLimit(t.serviceDb, { ...base, now: at("2026-09-22T10:59:59Z") })).allowed).toBe(true);
    expect((await consumeRateLimit(t.serviceDb, { ...base, now: at("2026-09-22T10:59:59Z") })).allowed).toBe(false);
    const next = await consumeRateLimit(t.serviceDb, { ...base, now: at("2026-09-22T11:00:00Z") });
    expect(next.allowed).toBe(true);
    expect(next.count).toBe(1);
  });

  it("keeps buckets and accounts apart", async () => {
    const other = await t.createAccount("limits-other@example.com");
    const now = at("2026-09-22T12:30:00Z");
    await consumeRateLimit(t.serviceDb, { accountId, bucket: "unit_c", limit: 1, windowMs: HOUR, now });
    const sameAccountOtherBucket = await consumeRateLimit(t.serviceDb, {
      accountId,
      bucket: "unit_d",
      limit: 1,
      windowMs: HOUR,
      now,
    });
    const otherAccountSameBucket = await consumeRateLimit(t.serviceDb, {
      accountId: other,
      bucket: "unit_c",
      limit: 1,
      windowMs: HOUR,
      now,
    });
    expect(sameAccountOtherBucket.count).toBe(1);
    expect(otherAccountSameBucket.count).toBe(1);
  });

  it("increments atomically under concurrent calls", async () => {
    const opts = { accountId, bucket: "unit_e", limit: 100, windowMs: HOUR, now: at("2026-09-22T13:00:00Z") };
    const results = await Promise.all(Array.from({ length: 6 }, () => consumeRateLimit(t.serviceDb, opts)));
    expect(results.map((r) => r.count).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("is invisible to the RLS-enforced app role", async () => {
    await expect(
      sql`select count(*) from public.account_rate_limit_windows`.execute(t.scopedDb(accountId)),
    ).rejects.toThrow(/permission denied/);
  });
});

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createTestDb, type TestDatabase } from "@/test-support/pglite-db";

import {
  getNewsletterLists,
  isValidNewsletterList,
  recordNewsletterSignup,
} from "./newsletter";

describe("getNewsletterLists", () => {
  const original = process.env.NEWSLETTER_LISTS;
  afterEach(() => {
    if (original === undefined) delete process.env.NEWSLETTER_LISTS;
    else process.env.NEWSLETTER_LISTS = original;
  });

  it("falls back to the default newsletter list when unset", () => {
    delete process.env.NEWSLETTER_LISTS;
    expect(getNewsletterLists()).toEqual(["newsletter"]);
  });

  it("parses a comma-separated list, trimming and dropping blanks", () => {
    process.env.NEWSLETTER_LISTS = " newsletter , product-updates ,,";
    expect(getNewsletterLists()).toEqual([
      "newsletter",
      "product-updates",
    ]);
  });

  it("validates membership", () => {
    process.env.NEWSLETTER_LISTS = "newsletter,product-updates";
    expect(isValidNewsletterList("product-updates")).toBe(true);
    expect(isValidNewsletterList("nope")).toBe(false);
  });
});

const base = {
  locale: "en" as const,
  list: "newsletter",
  ipHash: null,
  maxPerIp: 5,
  window: "01:00:00",
};

describe("recordNewsletterSignup", () => {
  let t: TestDatabase;

  beforeAll(async () => {
    t = await createTestDb();
  }, 60_000);

  afterAll(async () => {
    await t?.close();
  });

  it("stores a new signup and reports it as new", async () => {
    const result = await recordNewsletterSignup(t.serviceDb, {
      ...base,
      email: "new@example.com",
    });
    expect(result.isNew).toBe(true);
    expect(result.rateLimited).toBe(false);
    expect(result.id).toMatch(/^[0-9a-f-]{36}$/);

    const row = await t.serviceDb
      .selectFrom("newsletter_signups")
      .select(["email", "locale", "list", "ip_hash"])
      .where("id", "=", result.id!)
      .executeTakeFirstOrThrow();
    expect(row).toEqual({
      email: "new@example.com",
      locale: "en",
      list: "newsletter",
      ip_hash: null,
    });
  });

  it("dedupes an existing email on the same list (case-insensitive)", async () => {
    const first = await recordNewsletterSignup(t.serviceDb, {
      ...base,
      email: "dupe@example.com",
    });
    const again = await recordNewsletterSignup(t.serviceDb, {
      ...base,
      email: "DUPE@example.com",
    });
    expect(again).toEqual({ id: first.id, isNew: false, rateLimited: false });
  });

  it("keeps the same email separate across lists", async () => {
    process.env.NEWSLETTER_LISTS = "newsletter,product-updates";
    const a = await recordNewsletterSignup(t.serviceDb, {
      ...base,
      email: "multi@example.com",
    });
    const b = await recordNewsletterSignup(t.serviceDb, {
      ...base,
      list: "product-updates",
      email: "multi@example.com",
    });
    expect(a.isNew).toBe(true);
    expect(b.isNew).toBe(true);
    expect(b.id).not.toBe(a.id);
  });

  it("rate-limits by ip hash within the window and stores nothing", async () => {
    const ipHash = "ip-limited";
    for (let i = 0; i < 2; i++) {
      const ok = await recordNewsletterSignup(t.serviceDb, {
        ...base,
        ipHash,
        maxPerIp: 2,
        email: `rl-${i}@example.com`,
      });
      expect(ok.rateLimited).toBe(false);
    }
    const limited = await recordNewsletterSignup(t.serviceDb, {
      ...base,
      ipHash,
      maxPerIp: 2,
      email: "rl-3@example.com",
    });
    expect(limited).toEqual({ id: null, isNew: false, rateLimited: true });

    const stored = await t.serviceDb
      .selectFrom("newsletter_signups")
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .where("email", "=", "rl-3@example.com")
      .executeTakeFirstOrThrow();
    expect(stored.count).toBe(0);
  });

  it("skips the per-ip limit when no hash is available", async () => {
    for (let i = 0; i < 4; i++) {
      const result = await recordNewsletterSignup(t.serviceDb, {
        ...base,
        ipHash: null,
        maxPerIp: 1,
        email: `anon-${i}@example.com`,
      });
      expect(result.rateLimited).toBe(false);
    }
  });
});

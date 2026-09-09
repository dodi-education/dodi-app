import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createTestDb, type TestDatabase } from "@/test-support/pglite-db";

import { getRegistrationMode, isInviteCodeActive } from "./registration";

describe("getRegistrationMode", () => {
  const original = process.env.REGISTRATION_MODE;
  afterEach(() => {
    if (original === undefined) delete process.env.REGISTRATION_MODE;
    else process.env.REGISTRATION_MODE = original;
  });

  it("defaults to open when unset", () => {
    delete process.env.REGISTRATION_MODE;
    expect(getRegistrationMode()).toBe("open");
  });

  it("defaults to open for invalid values", () => {
    process.env.REGISTRATION_MODE = "banana";
    expect(getRegistrationMode()).toBe("open");
  });

  it.each(["open", "invite", "closed"] as const)("accepts %s", (mode) => {
    process.env.REGISTRATION_MODE = mode;
    expect(getRegistrationMode()).toBe(mode);
  });

  it("is case-insensitive and trims whitespace", () => {
    process.env.REGISTRATION_MODE = "  INVITE ";
    expect(getRegistrationMode()).toBe("invite");
  });
});

describe("isInviteCodeActive", () => {
  let t: TestDatabase;

  beforeAll(async () => {
    t = await createTestDb();
    await t.serviceDb
      .insertInto("invite_codes")
      .values([
        { code: "FRIENDS-2026", is_active: true, note: "active" },
        { code: "OLD-CODE", is_active: false, note: "retired" },
      ])
      .execute();
  }, 60_000);

  afterAll(async () => {
    await t?.close();
  });

  it("returns false for blank codes without touching the db", async () => {
    expect(await isInviteCodeActive(t.serviceDb, "   ")).toBe(false);
  });

  it("matches an active code case-insensitively, trimming whitespace", async () => {
    expect(await isInviteCodeActive(t.serviceDb, "  friends-2026 ")).toBe(true);
    expect(await isInviteCodeActive(t.serviceDb, "FRIENDS-2026")).toBe(true);
  });

  it("returns false for an inactive code", async () => {
    expect(await isInviteCodeActive(t.serviceDb, "OLD-CODE")).toBe(false);
  });

  it("returns false for an unknown code", async () => {
    expect(await isInviteCodeActive(t.serviceDb, "NOPE")).toBe(false);
  });

  it("does not treat wildcard characters as a pattern", async () => {
    expect(await isInviteCodeActive(t.serviceDb, "%")).toBe(false);
    expect(await isInviteCodeActive(t.serviceDb, "FRIENDS-____")).toBe(false);
  });
});

import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestDb, type TestDatabase } from "@/test-support/pglite-db";

import { clampText, parseErrorLogSettings, recordErrorLog } from "./error-logs";

describe("parseErrorLogSettings", () => {
  it("defaults to everything on when unset/empty/all", () => {
    expect(parseErrorLogSettings(undefined)).toEqual({ client: true, server: true });
    expect(parseErrorLogSettings("")).toEqual({ client: true, server: true });
    expect(parseErrorLogSettings("all")).toEqual({ client: true, server: true });
  });

  it("turns everything off for none", () => {
    expect(parseErrorLogSettings("none")).toEqual({ client: false, server: false });
  });

  it("supports single types and comma lists (case/space tolerant)", () => {
    expect(parseErrorLogSettings("client")).toEqual({ client: true, server: false });
    expect(parseErrorLogSettings("Server")).toEqual({ client: false, server: true });
    expect(parseErrorLogSettings(" client , server ")).toEqual({
      client: true,
      server: true,
    });
  });
});

describe("clampText", () => {
  it("passes short values and nulls through", () => {
    expect(clampText("boom", 10)).toBe("boom");
    expect(clampText(null, 10)).toBeNull();
    expect(clampText(undefined, 10)).toBeNull();
    expect(clampText("", 10)).toBeNull();
  });

  it("truncates long values with an ellipsis", () => {
    expect(clampText("a".repeat(20), 10)).toBe(`${"a".repeat(10)}…`);
  });
});

describe("recordErrorLog", () => {
  let t: TestDatabase;
  let accountId: string;

  beforeAll(async () => {
    t = await createTestDb();
    accountId = await t.createAccount("parent@example.com");
  }, 60_000);

  afterAll(async () => {
    await t?.close();
  });

  /** The persisted row, for assertions on what actually landed. */
  async function stored(id: string) {
    return t.serviceDb
      .selectFrom("error_logs")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirstOrThrow();
  }

  it("persists the type and collapses missing fields to null", async () => {
    const result = await recordErrorLog(t.serviceDb, {
      accountId,
      type: "client",
      context: "game_build",
      provider: "anthropic",
      errorName: "APIConnectionError",
    });

    expect(await stored(result.id)).toMatchObject({
      account_id: accountId,
      type: "client",
      context: "game_build",
      provider: "anthropic",
      error_name: "APIConnectionError",
      kid_id: null,
      game_id: null,
      model: null,
      error_message: null,
      http_status: null,
      meta: null,
      user_agent: null,
    });
  });

  it("allows account-less server errors", async () => {
    const result = await recordErrorLog(t.serviceDb, {
      type: "server",
      context: "api/games#POST",
      errorName: "Error",
      errorMessage: "boom",
      httpStatus: 500,
    });
    expect(await stored(result.id)).toMatchObject({
      account_id: null,
      type: "server",
      context: "api/games#POST",
      http_status: 500,
    });
  });

  it("retries without kid/game attribution when the insert fails", async () => {
    // Stale ids (a kid/game deleted meanwhile) violate the FK on the first try.
    const result = await recordErrorLog(t.serviceDb, {
      accountId,
      kidId: randomUUID(),
      gameId: randomUUID(),
      type: "client",
      context: "game_update",
    });

    expect(await stored(result.id)).toMatchObject({
      account_id: accountId,
      context: "game_update",
      kid_id: null,
      game_id: null,
    });
  });

  it("throws when the un-attributed insert fails too", async () => {
    // An unknown account fails the FK on both attempts.
    await expect(
      recordErrorLog(t.serviceDb, {
        accountId: randomUUID(),
        kidId: randomUUID(),
        type: "client",
        context: "game_build",
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining("foreign key") });
  });

  it("runs under RLS for a user-authed report", async () => {
    const result = await recordErrorLog(t.scopedDb(accountId), {
      accountId,
      type: "client",
      context: "game_save",
    });
    expect((await stored(result.id)).account_id).toBe(accountId);
  });
});

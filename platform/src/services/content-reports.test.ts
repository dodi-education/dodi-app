import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestDb, type TestDatabase } from "@/test-support/pglite-db";

import {
  ContentReportTargetError,
  createContentReport,
  reportedGameTitle,
} from "./content-reports";
import { createKid } from "./kids";

/**
 * Content reports against real PGlite: a report may name the reporter's own
 * kid and any game the reporter can see (own, system, live Discover), never
 * another family's kid or private game, and private game titles never leak
 * into the operator's view.
 */
let t: TestDatabase;
let seq = 0;

beforeAll(async () => {
  t = await createTestDb();
}, 60_000);

afterAll(async () => {
  await t?.close();
});

async function family(): Promise<{ accountId: string; kidId: string }> {
  seq += 1;
  const accountId = await t.createAccount(`reporter-${seq}@example.com`);
  const kid = await createKid(t.serviceDb, {
    account_id: accountId,
    display_name: "enc:v1:name",
    social_id: `report-${seq}`,
  });
  return { accountId, kidId: kid.id };
}

async function game(accountId: string, kidId: string, published = false): Promise<string> {
  seq += 1;
  const now = new Date().toISOString();
  const { id } = await t.serviceDb
    .insertInto("games")
    .values({
      account_id: accountId,
      kid_id: kidId,
      title: published ? `Published game ${seq}` : `enc:v1:private-${seq}`,
      code_bundle: published ? "<html></html>" : "enc:v1:bundle",
      created_by: "parent",
      ...(published
        ? { publication_requested_at: now, published_at: now, approved_by: "system" as const }
        : {}),
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return id;
}

const BASE = {
  reason: "inappropriate" as const,
  details: "It told a scary story at bedtime.",
  clientPlatform: "web" as const,
};

describe("createContentReport", () => {
  it("stores a companion report for the reporter's own kid", async () => {
    const { accountId, kidId } = await family();

    const report = await createContentReport(t.serviceDb, {
      ...BASE,
      accountId,
      contentKind: "companion_answer",
      kidId,
      gameId: null,
    });

    expect(report).toMatchObject({
      account_id: accountId,
      kid_id: kidId,
      content_kind: "companion_answer",
      reason: "inappropriate",
      details: BASE.details,
      resolved_at: null,
    });
  });

  it("accepts another family's live Discover game", async () => {
    const publisher = await family();
    const reporter = await family();
    const published = await game(publisher.accountId, publisher.kidId, true);

    const report = await createContentReport(t.serviceDb, {
      ...BASE,
      accountId: reporter.accountId,
      contentKind: "discover_game",
      kidId: null,
      gameId: published,
    });

    expect(report.game_id).toBe(published);
    expect(await reportedGameTitle(t.serviceDb, published)).toMatch(/^Published game/);
  });

  it("refuses another family's kid or private game", async () => {
    const other = await family();
    const reporter = await family();
    const privateGame = await game(other.accountId, other.kidId);

    await expect(
      createContentReport(t.serviceDb, {
        ...BASE,
        accountId: reporter.accountId,
        contentKind: "companion_answer",
        kidId: other.kidId,
        gameId: null,
      }),
    ).rejects.toBeInstanceOf(ContentReportTargetError);
    await expect(
      createContentReport(t.serviceDb, {
        ...BASE,
        accountId: reporter.accountId,
        contentKind: "game",
        kidId: null,
        gameId: privateGame,
      }),
    ).rejects.toBeInstanceOf(ContentReportTargetError);
  });

  it("never hands a private game's sealed title to the operator view", async () => {
    const { accountId, kidId } = await family();
    const privateGame = await game(accountId, kidId);

    await createContentReport(t.serviceDb, {
      ...BASE,
      accountId,
      contentKind: "game",
      kidId,
      gameId: privateGame,
    });

    expect(await reportedGameTitle(t.serviceDb, privateGame)).toBeNull();
  });

  it("keeps the report but clears the kid when the kid is deleted", async () => {
    const { accountId, kidId } = await family();
    const report = await createContentReport(t.serviceDb, {
      ...BASE,
      accountId,
      contentKind: "companion_answer",
      kidId,
      gameId: null,
    });

    await t.serviceDb.deleteFrom("kids").where("id", "=", kidId).execute();

    const row = await t.serviceDb
      .selectFrom("content_reports")
      .select(["account_id", "kid_id"])
      .where("id", "=", report.id)
      .executeTakeFirstOrThrow();
    expect(row).toEqual({ account_id: accountId, kid_id: null });
  });
});

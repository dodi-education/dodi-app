import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createTestDb, type TestDatabase } from "../test-support/pglite-db";

import { shareSystemGamesWithKid } from "./games";

/** The two seeded system games. */
const SYS_DRAWING = "560b130f-80a6-4353-a750-deac44224c53";
const SYS_MANDALA = "00079709-ce39-4669-98e8-a3181640b4fb";

let t: TestDatabase;
let ACCOUNT: string;
let OTHER_ACCOUNT: string;
let KID: string;
let SIBLING: string;
let OTHER_KID: string;

async function createKid(accountId: string, socialId: string): Promise<string> {
  const { id } = await t.serviceDb
    .insertInto("kids")
    .values({ account_id: accountId, display_name: "enc:v1:kid", social_id: socialId })
    .returning("id")
    .executeTakeFirstOrThrow();
  return id;
}

/** The assertable core of every sharing row, ordered for stable comparison. */
async function rows() {
  const all = await t.serviceDb
    .selectFrom("game_sharings")
    .select(["game_id", "account_id", "kid_id"])
    .orderBy("game_id")
    .orderBy("kid_id")
    .execute();
  return all;
}

beforeAll(async () => {
  t = await createTestDb();
  ACCOUNT = await t.createAccount("family@example.com");
  OTHER_ACCOUNT = await t.createAccount("other@example.com");
  KID = await createKid(ACCOUNT, "kid-1");
  SIBLING = await createKid(ACCOUNT, "kid-0");
  OTHER_KID = await createKid(OTHER_ACCOUNT, "kid-2");
  // A custom game in the family: must never be auto-shared.
  await t.serviceDb
    .insertInto("games")
    .values({
      account_id: ACCOUNT,
      title: "enc:v1:k1:title",
      code_bundle: "enc:v1:k1:code",
      created_by: "parent",
      progress_kind: "open",
    })
    .execute();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  await t.serviceDb.deleteFrom("game_sharings").execute();
});

describe("shareSystemGamesWithKid", () => {
  it("shares every system game with the new kid, and only system games", async () => {
    await shareSystemGamesWithKid(t.scopedDb(ACCOUNT), ACCOUNT, KID);
    expect(await rows()).toEqual([
      { game_id: SYS_MANDALA, account_id: ACCOUNT, kid_id: KID },
      { game_id: SYS_DRAWING, account_id: ACCOUNT, kid_id: KID },
    ]);
  });

  it("skips games a family-wide row already covers", async () => {
    await t.serviceDb
      .insertInto("game_sharings")
      .values({ game_id: SYS_DRAWING, account_id: ACCOUNT, kid_id: null })
      .execute();
    await shareSystemGamesWithKid(t.scopedDb(ACCOUNT), ACCOUNT, KID);
    expect(await rows()).toEqual([
      { game_id: SYS_MANDALA, account_id: ACCOUNT, kid_id: KID },
      { game_id: SYS_DRAWING, account_id: ACCOUNT, kid_id: null },
    ]);
  });

  it("is idempotent: an existing per-kid row is not duplicated", async () => {
    await t.serviceDb
      .insertInto("game_sharings")
      .values([
        { game_id: SYS_DRAWING, account_id: ACCOUNT, kid_id: KID },
        { game_id: SYS_MANDALA, account_id: ACCOUNT, kid_id: KID },
      ])
      .execute();
    await shareSystemGamesWithKid(t.scopedDb(ACCOUNT), ACCOUNT, KID);
    expect(await rows()).toHaveLength(2);
  });

  it("a sibling's per-kid row does not cover the new kid", async () => {
    await t.serviceDb
      .insertInto("game_sharings")
      .values({ game_id: SYS_DRAWING, account_id: ACCOUNT, kid_id: SIBLING })
      .execute();
    await shareSystemGamesWithKid(t.scopedDb(ACCOUNT), ACCOUNT, KID);
    expect(await rows()).toContainEqual({
      game_id: SYS_DRAWING,
      account_id: ACCOUNT,
      kid_id: KID,
    });
  });

  it("another family's rows do not suppress this family's default", async () => {
    await t.serviceDb
      .insertInto("game_sharings")
      .values([
        { game_id: SYS_DRAWING, account_id: OTHER_ACCOUNT, kid_id: null },
        { game_id: SYS_MANDALA, account_id: OTHER_ACCOUNT, kid_id: OTHER_KID },
      ])
      .execute();
    await shareSystemGamesWithKid(t.scopedDb(ACCOUNT), ACCOUNT, KID);
    const all = await rows();
    expect(all).toContainEqual({
      game_id: SYS_DRAWING,
      account_id: ACCOUNT,
      kid_id: KID,
    });
    expect(all).toContainEqual({
      game_id: SYS_MANDALA,
      account_id: ACCOUNT,
      kid_id: KID,
    });
    // The other family's rows are untouched.
    expect(all.filter((r) => r.account_id === OTHER_ACCOUNT)).toHaveLength(2);
  });

  it("no-ops when there are no system games", async () => {
    const fresh = await createTestDb();
    try {
      await fresh.serviceDb.deleteFrom("games").where("is_system", "=", true).execute();
      const account = await fresh.createAccount("lonely@example.com");
      const { id: kid } = await fresh.serviceDb
        .insertInto("kids")
        .values({ account_id: account, display_name: "enc:v1:kid", social_id: "kid-9" })
        .returning("id")
        .executeTakeFirstOrThrow();
      await shareSystemGamesWithKid(fresh.scopedDb(account), account, kid);
      const sharings = await fresh.serviceDb.selectFrom("game_sharings").select("id").execute();
      expect(sharings).toHaveLength(0);
    } finally {
      await fresh.close();
    }
  });
});

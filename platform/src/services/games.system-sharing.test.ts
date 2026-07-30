import { describe, expect, it } from "vitest";

import { type Row, fakeDb } from "../test-support/fake-supabase";

import { shareSystemGamesWithKid } from "./games";

const ACCOUNT = "acc-1";
const OTHER_ACCOUNT = "acc-2";
const KID = "kid-1";
const SIBLING = "kid-0";

function db(sharings: Row[] = [], games?: Row[]) {
  return fakeDb({
    games: games ?? [
      { id: "sys-drawing", is_system: true },
      { id: "sys-mandala", is_system: true },
      { id: "custom-1", is_system: false, account_id: ACCOUNT },
    ],
    game_sharings: sharings,
  });
}

/** The assertable core of a sharing row (the fake adds a synthetic id). */
function rows(tables: { game_sharings: Row[] }) {
  return tables.game_sharings.map(({ game_id, account_id, kid_id }) => ({
    game_id,
    account_id,
    kid_id,
  }));
}

describe("shareSystemGamesWithKid", () => {
  it("shares every system game with the new kid — and only system games", async () => {
    const { client, tables } = db();
    await shareSystemGamesWithKid(client, ACCOUNT, KID);
    expect(rows(tables)).toEqual([
      { game_id: "sys-drawing", account_id: ACCOUNT, kid_id: KID },
      { game_id: "sys-mandala", account_id: ACCOUNT, kid_id: KID },
    ]);
  });

  it("skips games a family-wide row already covers", async () => {
    const { client, tables } = db([
      { game_id: "sys-drawing", account_id: ACCOUNT, kid_id: null },
    ]);
    await shareSystemGamesWithKid(client, ACCOUNT, KID);
    expect(rows(tables)).toEqual([
      { game_id: "sys-drawing", account_id: ACCOUNT, kid_id: null },
      { game_id: "sys-mandala", account_id: ACCOUNT, kid_id: KID },
    ]);
  });

  it("is idempotent — an existing per-kid row is not duplicated", async () => {
    const { client, tables } = db([
      { game_id: "sys-drawing", account_id: ACCOUNT, kid_id: KID },
      { game_id: "sys-mandala", account_id: ACCOUNT, kid_id: KID },
    ]);
    await shareSystemGamesWithKid(client, ACCOUNT, KID);
    expect(rows(tables)).toHaveLength(2);
  });

  it("a sibling's per-kid row does not cover the new kid", async () => {
    const { client, tables } = db([
      { game_id: "sys-drawing", account_id: ACCOUNT, kid_id: SIBLING },
    ]);
    await shareSystemGamesWithKid(client, ACCOUNT, KID);
    expect(rows(tables)).toContainEqual({
      game_id: "sys-drawing",
      account_id: ACCOUNT,
      kid_id: KID,
    });
  });

  it("another family's rows do not suppress this family's default", async () => {
    const { client, tables } = db([
      { game_id: "sys-drawing", account_id: OTHER_ACCOUNT, kid_id: null },
      { game_id: "sys-mandala", account_id: OTHER_ACCOUNT, kid_id: KID },
    ]);
    await shareSystemGamesWithKid(client, ACCOUNT, KID);
    expect(rows(tables)).toContainEqual({
      game_id: "sys-drawing",
      account_id: ACCOUNT,
      kid_id: KID,
    });
    expect(rows(tables)).toContainEqual({
      game_id: "sys-mandala",
      account_id: ACCOUNT,
      kid_id: KID,
    });
  });

  it("no-ops when there are no system games", async () => {
    const { client, tables } = db([], [
      { id: "custom-1", is_system: false, account_id: ACCOUNT },
    ]);
    await shareSystemGamesWithKid(client, ACCOUNT, KID);
    expect(tables.game_sharings).toHaveLength(0);
  });
});

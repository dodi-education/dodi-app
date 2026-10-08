import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestDb, type TestDatabase } from "@/test-support/pglite-db";

import { deleteAccount } from "./account-deletion";
import { createKid } from "./kids";

/**
 * Account deletion against real PGlite: the whole erase is the cascade from
 * `auth_users`, so these tests check that it actually reaches every family
 * table, signs out every session, and leaves other families intact.
 */
let t: TestDatabase;
let seq = 0;

beforeAll(async () => {
  t = await createTestDb();
}, 60_000);

afterAll(async () => {
  await t?.close();
});

async function family(): Promise<{ accountId: string; email: string; kidId: string }> {
  seq += 1;
  const email = `family-${seq}@example.com`;
  const accountId = await t.createAccount(email);
  const kid = await createKid(t.serviceDb, {
    account_id: accountId,
    display_name: "enc:v1:name",
    social_id: `handle-${seq}`,
  });
  return { accountId, email, kidId: kid.id };
}

async function game(
  accountId: string,
  kidId: string,
  extra: { source_game_id?: string; published?: boolean } = {},
): Promise<string> {
  seq += 1;
  const published = extra.published
    ? {
        publication_requested_at: new Date().toISOString(),
        published_at: new Date().toISOString(),
        approved_by: "system" as const,
      }
    : {};
  const { id } = await t.serviceDb
    .insertInto("games")
    .values({
      account_id: accountId,
      kid_id: kidId,
      title: extra.published ? `Published ${seq}` : `enc:v1:game-${seq}`,
      code_bundle: extra.published ? "<html></html>" : "enc:v1:bundle",
      created_by: "parent",
      source_game_id: extra.source_game_id ?? null,
      ...published,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return id;
}

async function count(
  table: "auth_users" | "auth_sessions" | "accounts" | "kids" | "games" | "game_snapshots" | "game_sharings" | "friendships",
  column: string,
  value: string,
): Promise<number> {
  const { rows } = await sql<{ n: number }>`
    select count(*)::int as n from ${sql.table(table)} where ${sql.ref(column)} = ${value}
  `.execute(t.serviceDb);
  return Number(rows[0]?.n ?? 0);
}

describe("deleteAccount", () => {
  it("erases the account, its family data and every session", async () => {
    const { accountId, email, kidId } = await family();
    await game(accountId, kidId);
    await t.serviceDb
      .insertInto("auth_sessions")
      .values({
        user_id: accountId,
        token: `token-${seq}`,
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .execute();
    await t.serviceDb
      .insertInto("auth_verifications")
      .values({
        identifier: `sign-in-otp-${email}`,
        value: "hashed-otp:0",
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      })
      .execute();

    const result = await deleteAccount(t.serviceDb, accountId);

    expect(result).toEqual({ hadLivePublications: false });
    expect(await count("auth_users", "id", accountId)).toBe(0);
    expect(await count("accounts", "id", accountId)).toBe(0);
    expect(await count("auth_sessions", "user_id", accountId)).toBe(0);
    expect(await count("kids", "account_id", accountId)).toBe(0);
    expect(await count("games", "account_id", accountId)).toBe(0);
    const otp = await t.serviceDb
      .selectFrom("auth_verifications")
      .select("id")
      .where("identifier", "=", `sign-in-otp-${email}`)
      .execute();
    expect(otp).toEqual([]);
  });

  it("reports a live Discover game and cleans up other families' links to it", async () => {
    const publisher = await family();
    const other = await family();
    const original = await game(publisher.accountId, publisher.kidId);
    const published = await game(publisher.accountId, publisher.kidId, {
      source_game_id: original,
      published: true,
    });
    await t.serviceDb
      .insertInto("game_sharings")
      .values({ account_id: other.accountId, kid_id: other.kidId, game_id: published })
      .execute();
    const remix = await game(other.accountId, other.kidId, { source_game_id: published });

    const result = await deleteAccount(t.serviceDb, publisher.accountId);

    expect(result).toEqual({ hadLivePublications: true });
    expect(await count("games", "id", published)).toBe(0);
    expect(await count("game_sharings", "account_id", other.accountId)).toBe(0);
    // The other family's remix is theirs: it stays, unlinked from the deleted original.
    const kept = await t.serviceDb
      .selectFrom("games")
      .select(["id", "source_game_id"])
      .where("id", "=", remix)
      .executeTakeFirst();
    expect(kept).toEqual({ id: remix, source_game_id: null });
    expect(await count("kids", "account_id", other.accountId)).toBe(1);
  });

  it("ends friendships and removes snapshots its kids sent to friends", async () => {
    const leaving = await family();
    const friend = await family();
    const friendship = await t.serviceDb
      .insertInto("friendships")
      .values({
        requester_account_id: leaving.accountId,
        requester_kid_id: leaving.kidId,
        addressee_account_id: friend.accountId,
        addressee_kid_id: friend.kidId,
        status: "accepted",
        addressee_accepted: true,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await t.serviceDb
      .insertInto("game_snapshots")
      .values({
        account_id: friend.accountId,
        kid_id: friend.kidId,
        origin: "received",
        sender_kid_id: leaving.kidId,
        friendship_id: friendship.id,
        info_enc: "sealed-info",
        payload_enc: "sealed-payload",
      })
      .execute();

    await deleteAccount(t.serviceDb, leaving.accountId);

    expect(await count("friendships", "addressee_account_id", friend.accountId)).toBe(0);
    expect(await count("game_snapshots", "account_id", friend.accountId)).toBe(0);
    expect(await count("accounts", "id", friend.accountId)).toBe(1);
  });

  it("returns null for an account that does not exist", async () => {
    expect(await deleteAccount(t.serviceDb, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});

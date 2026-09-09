import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestDb, type TestDatabase } from "@/test-support/pglite-db";

/**
 * The baseline applies to a real Postgres, provisions accounts from auth
 * users, and its RLS policies isolate accounts when the connection carries
 * app.account_id (what lib/db.ts stamps for user-authenticated requests).
 */
describe("baseline + RLS", () => {
  let t: TestDatabase;
  let alice: string;
  let bob: string;

  beforeAll(async () => {
    t = await createTestDb();
    alice = await t.createAccount("alice@example.com", { inviteCode: "dodi-beta" });
    bob = await t.createAccount("bob@example.com");
    await t.serviceDb
      .insertInto("kids")
      .values([
        { account_id: alice, display_name: "enc:alice-kid", social_id: "sid-a" },
        { account_id: bob, display_name: "enc:bob-kid", social_id: "sid-b" },
      ])
      .execute();
  }, 60_000);

  afterAll(async () => {
    await t?.close();
  });

  it("provisions public.accounts and records the invite redemption", async () => {
    const accounts = await t.serviceDb
      .selectFrom("accounts")
      .select(["id", "email"])
      .orderBy("email")
      .execute();
    expect(accounts).toEqual([
      { id: alice, email: "alice@example.com" },
      { id: bob, email: "bob@example.com" },
    ]);
    const redemptions = await t.serviceDb
      .selectFrom("invite_code_redemptions")
      .select("account_id")
      .execute();
    expect(redemptions).toEqual([{ account_id: alice }]);
  });

  it("carries system rows and policies", async () => {
    const games = await t.serviceDb
      .selectFrom("games")
      .select("system_key")
      .where("is_system", "=", true)
      .orderBy("system_key")
      .execute();
    expect(games.map((g) => g.system_key)).toEqual(["drawing-basic", "mandala-basic"]);
    const plans = await t.serviceDb.selectFrom("platform_plans").select("handle").execute();
    expect(plans.length).toBeGreaterThanOrEqual(4);
  });

  it("scopes user-path queries to the account", async () => {
    const asAlice = await t
      .scopedDb(alice)
      .selectFrom("kids")
      .select(["account_id", "display_name"])
      .execute();
    expect(asAlice).toEqual([{ account_id: alice, display_name: "enc:alice-kid" }]);

    const asBob = await t.scopedDb(bob).selectFrom("kids").select("display_name").execute();
    expect(asBob).toEqual([{ display_name: "enc:bob-kid" }]);

    // Writes across the boundary are rejected by WITH CHECK.
    await expect(
      t
        .scopedDb(alice)
        .insertInto("kids")
        .values({ account_id: bob, display_name: "enc:x", social_id: "sid-x" })
        .execute(),
    ).rejects.toThrow(/row-level security/);

    // The service handle sees everything.
    const all = await t.serviceDb.selectFrom("kids").select("id").execute();
    expect(all).toHaveLength(2);
  });

  it("clears the account setting between checkouts", async () => {
    await t.scopedDb(alice).selectFrom("kids").select("id").execute();
    const unscoped = await t.serviceDb
      .selectFrom("kids")
      .select("id")
      .execute();
    expect(unscoped).toHaveLength(2);
  });
});

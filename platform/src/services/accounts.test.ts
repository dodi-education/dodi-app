import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestDb, type TestDatabase } from "@/test-support/pglite-db";

import { getAccount, updateAccountInterfacePreferences } from "./accounts";

describe("updateAccountInterfacePreferences", () => {
  let t: TestDatabase;
  let accountId: string;

  beforeAll(async () => {
    t = await createTestDb();
    accountId = await t.createAccount("parent@example.com");
  }, 60_000);

  afterAll(async () => {
    await t.close();
  });

  it("starts empty, so every toggle reads as its default", async () => {
    const account = await getAccount(t.scopedDb(accountId), accountId);
    expect(account?.interface_preferences).toEqual({});
  });

  it("merges a partial update into the stored preferences", async () => {
    const db = t.scopedDb(accountId);
    await db
      .updateTable("accounts")
      .set({ interface_preferences: { future_toggle: true } })
      .where("id", "=", accountId)
      .execute();

    const merged = await updateAccountInterfacePreferences(db, accountId, {
      is_3d_enabled: false,
    });

    expect(merged).toEqual({ future_toggle: true, is_3d_enabled: false });
    const account = await getAccount(db, accountId);
    expect(account?.interface_preferences).toEqual(merged);
  });
});

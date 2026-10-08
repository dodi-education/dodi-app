import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestDb, type TestDatabase } from "@/test-support/pglite-db";

import { createCompanion, deleteCompanion } from "./companions";
import {
  CustomTrickError,
  MAX_CUSTOM_TRICKS_PER_COMPANION,
  createCustomTrick,
  deleteCustomTrick,
  listCustomTricks,
} from "./custom-tricks";
import { createKid, getKid } from "./kids";

let t: TestDatabase;
let seq = 0;

beforeAll(async () => {
  t = await createTestDb();
}, 60_000);

afterAll(async () => {
  await t?.close();
});

async function companionOf(accountId: string): Promise<{ kidId: string; companionId: string }> {
  seq += 1;
  const kid = await createKid(t.serviceDb, {
    account_id: accountId,
    display_name: "enc:v1:name",
    social_id: `trick-${seq}`,
  });
  return { kidId: kid.id, companionId: kid.companions[0].id };
}

async function account(): Promise<string> {
  return t.createAccount(`trick-parent-${(seq += 1)}@example.com`);
}

describe("custom tricks", () => {
  it("stores, lists and forgets sealed tricks", async () => {
    const accountId = await account();
    const { companionId } = await companionOf(accountId);
    const first = await createCustomTrick(t.serviceDb, accountId, companionId, "enc:v1:a");
    await createCustomTrick(t.serviceDb, accountId, companionId, "enc:v1:b");
    expect((await listCustomTricks(t.serviceDb, accountId, companionId)).map((r) => r.trick_enc)).toEqual([
      "enc:v1:a",
      "enc:v1:b",
    ]);
    await deleteCustomTrick(t.serviceDb, accountId, companionId, first.id);
    expect(await listCustomTricks(t.serviceDb, accountId, companionId)).toHaveLength(1);
  });

  it("caps tricks per companion", async () => {
    const accountId = await account();
    const { companionId } = await companionOf(accountId);
    for (let i = 0; i < MAX_CUSTOM_TRICKS_PER_COMPANION; i++) {
      await createCustomTrick(t.serviceDb, accountId, companionId, `enc:v1:${i}`);
    }
    await expect(createCustomTrick(t.serviceDb, accountId, companionId, "enc:v1:x")).rejects.toSatisfy(
      (e: unknown) => e instanceof CustomTrickError && e.code === "trick_limit_reached",
    );
  });

  it("refuses another account's companion", async () => {
    const { companionId } = await companionOf(await account());
    const other = await account();
    await expect(listCustomTricks(t.serviceDb, other, companionId)).rejects.toBeInstanceOf(CustomTrickError);
    await expect(createCustomTrick(t.serviceDb, other, companionId, "enc:v1:x")).rejects.toBeInstanceOf(
      CustomTrickError,
    );
  });

  it("goes with its companion", async () => {
    const accountId = await account();
    const { kidId, companionId } = await companionOf(accountId);
    await createCompanion(t.serviceDb, accountId, kidId, {});
    await createCustomTrick(t.serviceDb, accountId, companionId, "enc:v1:a");
    await deleteCompanion(t.serviceDb, accountId, companionId);
    const rows = await t.serviceDb.selectFrom("custom_tricks").selectAll().where("companion_id", "=", companionId).execute();
    expect(rows).toEqual([]);
    expect((await getKid(t.serviceDb, kidId))?.companions).toHaveLength(1);
  });

  it("is hidden from other accounts by RLS and the composite key", async () => {
    const accountId = await account();
    const { companionId } = await companionOf(accountId);
    await createCustomTrick(t.serviceDb, accountId, companionId, "enc:v1:a");
    const other = await account();
    expect(
      await t.scopedDb(other).selectFrom("custom_tricks").selectAll().where("companion_id", "=", companionId).execute(),
    ).toEqual([]);
    await expect(
      t.scopedDb(other).insertInto("custom_tricks").values({ account_id: other, companion_id: companionId, trick_enc: "x" }).execute(),
    ).rejects.toThrow();
  });
});

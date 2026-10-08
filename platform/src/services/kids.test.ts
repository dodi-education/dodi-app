import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestDb, type TestDatabase } from "@/test-support/pglite-db";

import { createKid, deleteKid, getKid, updateKid } from "./kids";

/**
 * kids service against real PGlite. The focus here is the two independent
 * companion-presence columns — deafened_dodi_at (hearing) and muted_dodi_at
 * (output) — which the PATCH route writes verbatim through updateKid.
 */
let t: TestDatabase;
let seq = 0;

beforeAll(async () => {
  t = await createTestDb();
}, 60_000);

afterAll(async () => {
  await t?.close();
});

async function kid(accountId: string): Promise<string> {
  seq += 1;
  const created = await createKid(t.serviceDb, {
    account_id: accountId,
    display_name: "enc:v1:name",
    social_id: `handle-${seq}`,
  });
  return created.id;
}

describe("companion presence columns", () => {
  it("round-trips muted_dodi_at through updateKid/getKid", async () => {
    const accountId = await t.createAccount(`parent-${(seq += 1)}@example.com`);
    const id = await kid(accountId);

    const at = "2026-09-15T10:00:00.000Z";
    await updateKid(t.serviceDb, id, { muted_dodi_at: at });
    let row = await getKid(t.serviceDb, id);
    expect(row?.muted_dodi_at).not.toBeNull();
    expect(new Date(row!.muted_dodi_at as string).toISOString()).toBe(at);

    await updateKid(t.serviceDb, id, { muted_dodi_at: null });
    row = await getKid(t.serviceDb, id);
    expect(row?.muted_dodi_at).toBeNull();
  });

  it("mutes output and hearing independently", async () => {
    const accountId = await t.createAccount(`parent-${(seq += 1)}@example.com`);
    const id = await kid(accountId);
    const at = "2026-09-15T11:00:00.000Z";

    // Muting output leaves the deaf column untouched...
    await updateKid(t.serviceDb, id, { muted_dodi_at: at });
    let row = await getKid(t.serviceDb, id);
    expect(row?.muted_dodi_at).not.toBeNull();
    expect(row?.deafened_dodi_at).toBeNull();

    // ...and going deaf leaves the mute untouched.
    await updateKid(t.serviceDb, id, { deafened_dodi_at: at });
    row = await getKid(t.serviceDb, id);
    expect(row?.deafened_dodi_at).not.toBeNull();
    expect(row?.muted_dodi_at).not.toBeNull();

    // Clearing one leaves the other set.
    await updateKid(t.serviceDb, id, { deafened_dodi_at: null });
    row = await getKid(t.serviceDb, id);
    expect(row?.deafened_dodi_at).toBeNull();
    expect(row?.muted_dodi_at).not.toBeNull();
  });
});

describe("deleteKid", () => {
  /**
   * A snapshot a kid sent to a friend lives in the friend family's account as a
   * `received` row pointing back at the sender kid. Deleting the sender kid (or
   * the whole sender account) must not be blocked by that row.
   */
  async function sentSnapshotToFriend(): Promise<{
    senderAccount: string;
    senderKid: string;
    receivedId: string;
  }> {
    const senderAccount = await t.createAccount(`sender-${(seq += 1)}@example.com`);
    const receiverAccount = await t.createAccount(`receiver-${(seq += 1)}@example.com`);
    const senderKid = await kid(senderAccount);
    const receiverKid = await kid(receiverAccount);
    const friendship = await t.serviceDb
      .insertInto("friendships")
      .values({
        requester_account_id: senderAccount,
        requester_kid_id: senderKid,
        addressee_account_id: receiverAccount,
        addressee_kid_id: receiverKid,
        status: "accepted",
        addressee_accepted: true,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    const received = await t.serviceDb
      .insertInto("game_snapshots")
      .values({
        account_id: receiverAccount,
        kid_id: receiverKid,
        origin: "received",
        sender_kid_id: senderKid,
        friendship_id: friendship.id,
        info_enc: "sealed-info",
        payload_enc: "sealed-payload",
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    return { senderAccount, senderKid, receivedId: received.id };
  }

  async function snapshotExists(id: string): Promise<boolean> {
    const row = await t.serviceDb
      .selectFrom("game_snapshots")
      .select("id")
      .where("id", "=", id)
      .executeTakeFirst();
    return row !== undefined;
  }

  it("removes snapshots the kid sent to friends, so the delete is not blocked", async () => {
    const { senderKid, receivedId } = await sentSnapshotToFriend();

    await deleteKid(t.serviceDb, senderKid);

    expect(await getKid(t.serviceDb, senderKid)).toBeNull();
    expect(await snapshotExists(receivedId)).toBe(false);
  });

  it("does not block deleting the sender's whole account either", async () => {
    const { senderAccount, receivedId } = await sentSnapshotToFriend();

    await t.serviceDb.deleteFrom("auth_users").where("id", "=", senderAccount).execute();

    expect(await snapshotExists(receivedId)).toBe(false);
  });
});

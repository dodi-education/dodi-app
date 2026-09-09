import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { GameSnapshotInsert } from "@dodi/types/database";

import { isForeignKeyViolation } from "@/lib/db-errors";
import { createTestDb, type TestDatabase } from "@/test-support/pglite-db";

import {
  createOwnSnapshot,
  deleteSnapshot,
  getAutosaveSnapshot,
  getSnapshot,
  listSnapshots,
  markSnapshotViewed,
  shareSnapshot,
  upsertAutosaveSnapshot,
} from "./snapshots";

/**
 * The snapshots service runs on the service handle (BYPASSRLS) and enforces
 * account scoping itself, so every test calls it with `t.serviceDb` against
 * real rows in PGlite (FKs, the autosave partial unique index, CHECKs).
 */
let t: TestDatabase;
let seq = 0;

/**
 * PGlite throws errors that carry the same `code`/`constraint`/`detail` fields
 * as pg's DatabaseError but are not instances of it. Until lib/db-errors.ts
 * recognises them structurally, the FK-degrade tests cannot observe the retry
 * on PGlite, so they are gated on the guard's behaviour and switch on by
 * themselves once it accepts structural matches.
 */
const FK_DETECTION_WORKS = isForeignKeyViolation(
  { code: "23503", severity: "ERROR", constraint: "x" },
  "x",
);

// Two families, one accepted friendship between their kids.
let accA: string;
let kidA: string;
let accB: string;
let kidB: string;
let friendshipId: string;
let gameA: string;

beforeAll(async () => {
  t = await createTestDb();
  accA = await t.createAccount("family-a@example.com");
  accB = await t.createAccount("family-b@example.com");
  kidA = await kid(accA, "sign-a");
  kidB = await kid(accB, "sign-b");
  friendshipId = await friendship("accepted");
  gameA = await game(accA, kidA);
}, 60_000);

afterAll(async () => {
  await t?.close();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

async function kid(accountId: string, signKey: string): Promise<string> {
  seq += 1;
  const { id } = await t.serviceDb
    .insertInto("kids")
    .values({
      account_id: accountId,
      display_name: "enc:v1:name",
      social_id: `handle-${seq}`,
      friend_kem_public_key: "kem-x",
      friend_sign_public_key: signKey,
      friend_secret_keys: "enc:v1:secret",
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return id;
}

async function friendship(status: "accepted" | "pending"): Promise<string> {
  const { id } = await t.serviceDb
    .insertInto("friendships")
    .values({
      requester_account_id: accA,
      requester_kid_id: kidA,
      addressee_account_id: accB,
      addressee_kid_id: kidB,
      status,
      addressee_accepted: status === "accepted",
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return id;
}

async function game(accountId: string, kidId: string): Promise<string> {
  seq += 1;
  const { id } = await t.serviceDb
    .insertInto("games")
    .values({
      account_id: accountId,
      kid_id: kidId,
      title: `enc:v1:game-${seq}`,
      code_bundle: "enc:v1:bundle",
      created_by: "parent",
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return id;
}

async function snapshotRow(
  overrides: Partial<GameSnapshotInsert> = {},
): Promise<string> {
  const { id } = await t.serviceDb
    .insertInto("game_snapshots")
    .values({
      account_id: accA,
      kid_id: kidA,
      origin: "own",
      info_enc: "enc:v1:info",
      payload_enc: "enc:v1:payload",
      payload_bytes: 100,
      ...overrides,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return id;
}

async function storedSnapshot(id: string) {
  return t.serviceDb
    .selectFrom("game_snapshots")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();
}

async function clearSnapshots(): Promise<void> {
  await t.serviceDb.deleteFrom("game_snapshots").execute();
}

const SEALED = {
  infoEnc: JSON.stringify({ sealed: "info" }),
  payloadEnc: JSON.stringify({ sealed: "payload" }),
  payloadBytes: 1234,
};

// ---------------------------------------------------------------------------
// shareSnapshot — validation matrix
// ---------------------------------------------------------------------------

describe("shareSnapshot", () => {
  it("inserts a received row scoped to the other side's kid + account", async () => {
    await clearSnapshots();
    const result = await shareSnapshot(t.serviceDb, {
      senderAccountId: accA,
      senderKidId: kidA,
      friendshipId,
      gameId: gameA,
      ...SEALED,
    });
    expect(result.recipientKidId).toBe(kidB);
    const row = await storedSnapshot(result.id);
    expect(row).toMatchObject({
      account_id: accB,
      kid_id: kidB,
      origin: "received",
      sender_kid_id: kidA,
      friendship_id: friendshipId,
      // Soft reference to the SENDER's game — no longer nulled on delivery.
      game_id: gameA,
      info_enc: SEALED.infoEnc,
      payload_enc: SEALED.payloadEnc,
      payload_bytes: SEALED.payloadBytes,
    });
  });

  it("works from the addressee side too", async () => {
    const result = await shareSnapshot(t.serviceDb, {
      senderAccountId: accB,
      senderKidId: kidB,
      friendshipId,
      gameId: null,
      ...SEALED,
    });
    expect(result.recipientKidId).toBe(kidA);
    expect((await storedSnapshot(result.id))?.account_id).toBe(accA);
  });

  it("rejects a friendship that is not accepted", async () => {
    // A second pending row for the same pair is blocked by the live-pair
    // index, so use fresh kids for the pending friendship.
    const kidC = await kid(accA, "sign-c");
    const kidD = await kid(accB, "sign-d");
    const { id: pendingId } = await t.serviceDb
      .insertInto("friendships")
      .values({
        requester_account_id: accA,
        requester_kid_id: kidC,
        addressee_account_id: accB,
        addressee_kid_id: kidD,
        status: "pending",
        addressee_accepted: false,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await clearSnapshots();
    await expect(
      shareSnapshot(t.serviceDb, {
        senderAccountId: accA,
        senderKidId: kidC,
        friendshipId: pendingId,
        gameId: gameA,
        ...SEALED,
      }),
    ).rejects.toThrow("friendship_not_accepted");
    expect(await t.serviceDb.selectFrom("game_snapshots").select("id").execute()).toEqual([]);
  });

  it("rejects a sender kid that is not on the friendship", async () => {
    const intruder = await kid(accA, "sign-i");
    await expect(
      shareSnapshot(t.serviceDb, {
        senderAccountId: accA,
        senderKidId: intruder,
        friendshipId,
        gameId: gameA,
        ...SEALED,
      }),
    ).rejects.toThrow("not_participant");
  });

  it("rejects a sender kid claimed by the wrong account", async () => {
    await expect(
      shareSnapshot(t.serviceDb, {
        senderAccountId: accB, // kidA belongs to accA
        senderKidId: kidA,
        friendshipId,
        gameId: gameA,
        ...SEALED,
      }),
    ).rejects.toThrow("not_participant");
  });

  it("rejects an unknown friendship", async () => {
    await expect(
      shareSnapshot(t.serviceDb, {
        senderAccountId: accA,
        senderKidId: kidA,
        friendshipId: randomUUID(),
        gameId: gameA,
        ...SEALED,
      }),
    ).rejects.toThrow("friendship_not_found");
  });

  it.skipIf(!FK_DETECTION_WORKS)("degrades to a NULL game reference when the sender's game is gone", async () => {
    const result = await shareSnapshot(t.serviceDb, {
      senderAccountId: accA,
      senderKidId: kidA,
      friendshipId,
      gameId: randomUUID(), // deleted game: the FK no longer resolves
      ...SEALED,
    });
    expect(result.recipientKidId).toBe(kidB);
    expect((await storedSnapshot(result.id))?.game_id).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Autosave slot — one hidden row per (kid, game), overwritten in place
// ---------------------------------------------------------------------------

describe("upsertAutosaveSnapshot / getAutosaveSnapshot", () => {
  it("creates the slot on first save and overwrites it in place afterwards", async () => {
    await clearSnapshots();
    const first = await upsertAutosaveSnapshot(t.serviceDb, {
      accountId: accA,
      kidId: kidA,
      gameId: gameA,
      ...SEALED,
    });
    const created = await storedSnapshot(first.id);
    expect(created?.origin).toBe("autosave");
    expect(created?.game_id).toBe(gameA);

    const second = await upsertAutosaveSnapshot(t.serviceDb, {
      accountId: accA,
      kidId: kidA,
      gameId: gameA,
      infoEnc: "enc:v1:info-2",
      payloadEnc: "enc:v1:payload-2",
      payloadBytes: 999,
    });
    expect(second.id).toBe(first.id);
    const rows = await t.serviceDb.selectFrom("game_snapshots").selectAll().execute();
    expect(rows).toHaveLength(1);
    expect(rows[0].payload_enc).toBe("enc:v1:payload-2");
    expect(rows[0].payload_bytes).toBe(999);
  });

  it("keeps separate slots per game", async () => {
    await clearSnapshots();
    const gameA2 = await game(accA, kidA);
    await upsertAutosaveSnapshot(t.serviceDb, {
      accountId: accA,
      kidId: kidA,
      gameId: gameA,
      ...SEALED,
    });
    await upsertAutosaveSnapshot(t.serviceDb, {
      accountId: accA,
      kidId: kidA,
      gameId: gameA2,
      ...SEALED,
    });
    const rows = await t.serviceDb.selectFrom("game_snapshots").select("id").execute();
    expect(rows).toHaveLength(2);
  });

  it("rejects a kid the caller does not own", async () => {
    await expect(
      upsertAutosaveSnapshot(t.serviceDb, {
        accountId: accA,
        kidId: kidB,
        gameId: gameA,
        ...SEALED,
      }),
    ).rejects.toThrow("kid_not_found");
  });

  it("getAutosaveSnapshot returns the slot with payload, or null", async () => {
    await clearSnapshots();
    const slotId = await snapshotRow({ origin: "autosave", game_id: gameA });
    const found = await getAutosaveSnapshot(t.serviceDb, {
      accountId: accA,
      kidId: kidA,
      gameId: gameA,
    });
    expect(found?.id).toBe(slotId);
    expect(found?.payloadEnc).toBe("enc:v1:payload");

    const none = await getAutosaveSnapshot(t.serviceDb, {
      accountId: accA,
      kidId: kidA,
      gameId: randomUUID(),
    });
    expect(none).toBeNull();
  });

  it("rejects reading a slot for a kid of another account", async () => {
    await expect(
      getAutosaveSnapshot(t.serviceDb, {
        accountId: accA,
        kidId: kidB,
        gameId: gameA,
      }),
    ).rejects.toThrow("kid_not_found");
  });
});

// ---------------------------------------------------------------------------
// Own-snapshot CRUD scoping
// ---------------------------------------------------------------------------

describe("createOwnSnapshot", () => {
  it("stores an own row for the caller's kid", async () => {
    await clearSnapshots();
    const created = await createOwnSnapshot(t.serviceDb, {
      accountId: accA,
      kidId: kidA,
      gameId: gameA,
      ...SEALED,
    });
    expect(created.id).toBeTruthy();
    expect(created.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const row = await storedSnapshot(created.id);
    expect(row).toMatchObject({ origin: "own", account_id: accA, game_id: gameA });
  });

  it("rejects a kid the caller does not own", async () => {
    await expect(
      createOwnSnapshot(t.serviceDb, {
        accountId: accA,
        kidId: kidB,
        gameId: null,
        ...SEALED,
      }),
    ).rejects.toThrow("kid_not_found");
  });

  it("records the sent-to friend kid when the save was created by sharing", async () => {
    const created = await createOwnSnapshot(t.serviceDb, {
      accountId: accA,
      kidId: kidA,
      gameId: gameA,
      sharedWithKidId: kidB,
      ...SEALED,
    });
    expect((await storedSnapshot(created.id))?.shared_with_kid_id).toBe(kidB);
  });

  it.skipIf(!FK_DETECTION_WORKS)("degrades the sent marker to NULL when the friend kid is gone", async () => {
    const created = await createOwnSnapshot(t.serviceDb, {
      accountId: accA,
      kidId: kidA,
      gameId: gameA,
      sharedWithKidId: randomUUID(), // deleted friend kid
      ...SEALED,
    });
    expect(created.id).toBeTruthy();
    const row = await storedSnapshot(created.id);
    expect(row?.shared_with_kid_id).toBeNull();
    // The save itself must survive losing the pointer.
    expect(row?.game_id).toBe(gameA);
  });

  it.skipIf(!FK_DETECTION_WORKS)("drops both dangling pointers when game and friend kid are gone", async () => {
    const created = await createOwnSnapshot(t.serviceDb, {
      accountId: accA,
      kidId: kidA,
      gameId: randomUUID(),
      sharedWithKidId: randomUUID(),
      ...SEALED,
    });
    const row = await storedSnapshot(created.id);
    expect(row?.game_id).toBeNull();
    expect(row?.shared_with_kid_id).toBeNull();
  });
});

describe("listSnapshots / getSnapshot", () => {
  it("lists only the kid's rows (never autosaves) and joins the sender's signing key", async () => {
    await clearSnapshots();
    const own = await snapshotRow({});
    const received = await snapshotRow({
      origin: "received",
      sender_kid_id: kidB,
      friendship_id: friendshipId,
    });
    // The hidden resume slot must not surface in the collection.
    await snapshotRow({ origin: "autosave", game_id: gameA });
    await snapshotRow({ account_id: accB, kid_id: kidB });

    const items = await listSnapshots(t.serviceDb, { accountId: accA, kidId: kidA });
    expect(items.map((i) => i.id).sort()).toEqual([own, received].sort());
    const receivedItem = items.find((i) => i.id === received);
    expect(receivedItem?.senderSignPublicKey).toBe("sign-b");
    // Light rows must not carry the heavy payload blob.
    expect("payloadEnc" in (receivedItem ?? {})).toBe(false);
  });

  it("lists newest first", async () => {
    await clearSnapshots();
    const older = await snapshotRow({ created_at: "2026-01-01T00:00:00Z" });
    const newer = await snapshotRow({ created_at: "2026-02-01T00:00:00Z" });
    const items = await listSnapshots(t.serviceDb, { accountId: accA, kidId: kidA });
    expect(items.map((i) => i.id)).toEqual([newer, older]);
  });

  it("surfaces autosave slots only when includeAutosave is set", async () => {
    await clearSnapshots();
    const own = await snapshotRow({});
    const auto = await snapshotRow({ origin: "autosave", game_id: gameA });
    const items = await listSnapshots(t.serviceDb, {
      accountId: accA,
      kidId: kidA,
      includeAutosave: true,
    });
    expect(items.map((i) => i.id).sort()).toEqual([auto, own].sort());
  });

  it("carries the sent marker on list items", async () => {
    await clearSnapshots();
    await snapshotRow({ shared_with_kid_id: kidB });
    const items = await listSnapshots(t.serviceDb, { accountId: accA, kidId: kidA });
    expect(items[0].sharedWithKidId).toBe(kidB);
  });

  it("rejects listing for a kid of another account", async () => {
    await expect(
      listSnapshots(t.serviceDb, { accountId: accA, kidId: kidB }),
    ).rejects.toThrow("kid_not_found");
  });

  it("getSnapshot returns the payload but hides other accounts' rows", async () => {
    await clearSnapshots();
    const id = await snapshotRow({});
    const mine = await getSnapshot(t.serviceDb, { accountId: accA, id });
    expect(mine?.payloadEnc).toBe("enc:v1:payload");
    const theirs = await getSnapshot(t.serviceDb, { accountId: accB, id });
    expect(theirs).toBeNull();
  });
});

describe("markSnapshotViewed / deleteSnapshot", () => {
  it("sets viewed_at once and leaves it stable", async () => {
    await clearSnapshots();
    const id = await snapshotRow({});
    await markSnapshotViewed(t.serviceDb, { accountId: accA, id });
    const first = (await storedSnapshot(id))?.viewed_at;
    expect(first).toBeTruthy();
    await markSnapshotViewed(t.serviceDb, { accountId: accA, id });
    expect((await storedSnapshot(id))?.viewed_at).toBe(first);
  });

  it("refuses to mark another account's row", async () => {
    await clearSnapshots();
    const id = await snapshotRow({});
    await expect(
      markSnapshotViewed(t.serviceDb, { accountId: accB, id }),
    ).rejects.toThrow("snapshot_not_found");
  });

  it("deletes only rows the caller owns", async () => {
    await clearSnapshots();
    const id = await snapshotRow({});
    await expect(
      deleteSnapshot(t.serviceDb, { accountId: accB, id }),
    ).rejects.toThrow("snapshot_not_found");
    await deleteSnapshot(t.serviceDb, { accountId: accA, id });
    expect(await storedSnapshot(id)).toBeUndefined();
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { KidInsert } from "@dodi/types/database";

import { createTestDb, type TestDatabase } from "@/test-support/pglite-db";

import {
  blockFriend,
  computeStatus,
  createFriendRequest,
  listBlocked,
  listCardRefreshTargets,
  listFriends,
  listPendingApprovals,
  listRequests,
  lookupFriendTarget,
  refreshFriendCards,
  removeFriendship,
  respondToRequest,
  setParentApproval,
  unblockFriend,
} from "./friends";

/**
 * The friends service runs on the service handle (BYPASSRLS) and enforces
 * account scoping itself, so every test calls it with `t.serviceDb` against
 * real rows in PGlite (schema, FKs, the live-pair unique index).
 */
let t: TestDatabase;
let seq = 0;

beforeAll(async () => {
  t = await createTestDb();
}, 60_000);

afterAll(async () => {
  await t?.close();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

type KidOverrides = Partial<Omit<KidInsert, "account_id">>;

async function account(): Promise<string> {
  seq += 1;
  return t.createAccount(`parent-${seq}@example.com`);
}

/** Insert a kid with published friend keys; column defaults mirror the old fixture. */
async function kid(accountId: string, overrides: KidOverrides = {}): Promise<string> {
  seq += 1;
  const { id } = await t.serviceDb
    .insertInto("kids")
    .values({
      account_id: accountId,
      display_name: "enc:v1:name",
      social_id: `handle-${seq}`,
      friend_kem_public_key: "kem-x",
      friend_sign_public_key: "sign-x",
      friend_secret_keys: "enc:v1:secret",
      can_add_friends: true,
      can_be_added_as_friend: true,
      incoming_friend_requests_require_parent_approval: false,
      outgoing_friend_requests_require_parent_approval: false,
      ...overrides,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return id;
}

interface Pair {
  accA: string;
  kidA: string;
  accB: string;
  kidB: string;
}

/** Two kids on two accounts: A (requester side) and B (addressee side). */
async function pair(a: KidOverrides = {}, b: KidOverrides = {}): Promise<Pair> {
  const accA = await account();
  const accB = await account();
  return { accA, kidA: await kid(accA, a), accB, kidB: await kid(accB, b) };
}

const PREVIEW = JSON.stringify({ preview: true });
const FULL = JSON.stringify({ full: true });
const ADDR_CARD = JSON.stringify({ addressee: true });

function reqInput(
  p: Pair,
  over: Partial<Parameters<typeof createFriendRequest>[1]> = {},
) {
  return {
    requesterAccountId: p.accA,
    requesterKidId: p.kidA,
    targetKidId: p.kidB,
    previewCard: PREVIEW,
    fullCard: FULL,
    nickname: "enc:v1:nick",
    ...over,
  };
}

/** Request from A, accepted by B; returns the friendship id. */
async function accepted(p: Pair): Promise<string> {
  const created = await createFriendRequest(t.serviceDb, reqInput(p));
  await respondToRequest(t.serviceDb, {
    accountId: p.accB,
    kidId: p.kidB,
    friendshipId: created.id,
    action: "accept",
    addresseeCard: ADDR_CARD,
  });
  return created.id;
}

async function friendshipCount(): Promise<number> {
  const { count } = await t.serviceDb
    .selectFrom("friendships")
    .select(({ fn }) => fn.countAll<number>().as("count"))
    .executeTakeFirstOrThrow();
  return count;
}

// ---------------------------------------------------------------------------
// computeStatus (pure)
// ---------------------------------------------------------------------------

describe("computeStatus", () => {
  const base = {
    status: "pending",
    addressee_accepted: false,
    requester_parent_ok: null,
    addressee_parent_ok: null,
  };
  it("stays pending until the addressee accepts", () => {
    expect(computeStatus(base)).toBe("pending");
  });
  it("is accepted when accepted and no approvals are required", () => {
    expect(computeStatus({ ...base, addressee_accepted: true })).toBe("accepted");
  });
  it("waits for parent when a required side is still pending", () => {
    expect(
      computeStatus({ ...base, addressee_accepted: true, addressee_parent_ok: false }),
    ).toBe("awaiting_parent");
    expect(
      computeStatus({ ...base, addressee_accepted: true, requester_parent_ok: false }),
    ).toBe("awaiting_parent");
  });
  it("is accepted once every required approval is granted", () => {
    expect(
      computeStatus({
        status: "awaiting_parent",
        addressee_accepted: true,
        requester_parent_ok: true,
        addressee_parent_ok: true,
      }),
    ).toBe("accepted");
  });
  it("keeps terminal statuses", () => {
    expect(computeStatus({ ...base, status: "rejected" })).toBe("rejected");
    expect(computeStatus({ ...base, status: "blocked" })).toBe("blocked");
  });
});

// ---------------------------------------------------------------------------
// lookupFriendTarget
// ---------------------------------------------------------------------------

describe("lookupFriendTarget", () => {
  it("returns public keys for a discoverable kid", async () => {
    const acc = await account();
    const id = await kid(acc, { social_id: "emma" });
    const target = await lookupFriendTarget(t.serviceDb, "emma");
    expect(target).toEqual({ kidId: id, kemPublicKey: "kem-x", signPublicKey: "sign-x" });
  });
  it("hides a kid that cannot be added", async () => {
    const acc = await account();
    await kid(acc, { social_id: "hidden", can_be_added_as_friend: false });
    expect(await lookupFriendTarget(t.serviceDb, "hidden")).toBeNull();
  });
  it("hides a kid with no published keys", async () => {
    const acc = await account();
    await kid(acc, { social_id: "keyless", friend_kem_public_key: null });
    expect(await lookupFriendTarget(t.serviceDb, "keyless")).toBeNull();
  });
  it("returns null for an unknown handle", async () => {
    expect(await lookupFriendTarget(t.serviceDb, "nobody")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// createFriendRequest
// ---------------------------------------------------------------------------

describe("createFriendRequest", () => {
  it("creates a pending request and sets tri-state approval from settings", async () => {
    const p = await pair({ outgoing_friend_requests_require_parent_approval: true });
    const row = await createFriendRequest(t.serviceDb, reqInput(p));
    expect(row.status).toBe("pending");
    expect(row.requester_parent_ok).toBe(false); // requester's outgoing requires approval
    expect(row.addressee_parent_ok).toBeNull(); // addressee's incoming does not
    expect(row.requester_preview_card).toBe(PREVIEW);
    expect(row.requester_card).toBe(FULL);
    expect(row.addressee_account_id).toBe(p.accB);
  });

  it("refuses when the requester may not initiate", async () => {
    const p = await pair({ can_add_friends: false });
    await expect(createFriendRequest(t.serviceDb, reqInput(p))).rejects.toThrow(
      "cannot_initiate",
    );
  });

  it("refuses when the target may not be added", async () => {
    const p = await pair({}, { can_be_added_as_friend: false });
    await expect(createFriendRequest(t.serviceDb, reqInput(p))).rejects.toThrow(
      "target_unavailable",
    );
  });

  it("rejects a request to a kid the account does not own", async () => {
    const p = await pair();
    const evil = await account();
    await expect(
      createFriendRequest(t.serviceDb, reqInput(p, { requesterAccountId: evil })),
    ).rejects.toThrow("requester_not_found");
  });

  it("refuses a kid adding itself", async () => {
    const p = await pair();
    await expect(
      createFriendRequest(t.serviceDb, reqInput(p, { targetKidId: p.kidA })),
    ).rejects.toThrow("cannot_add_self");
  });

  it("reports a duplicate pending request as request_exists", async () => {
    const p = await pair();
    await createFriendRequest(t.serviceDb, reqInput(p));
    await expect(createFriendRequest(t.serviceDb, reqInput(p))).rejects.toThrow(
      "request_exists",
    );
  });

  it("reports an existing accepted friendship as already_friends", async () => {
    const p = await pair();
    await accepted(p);
    await expect(createFriendRequest(t.serviceDb, reqInput(p))).rejects.toThrow(
      "already_friends",
    );
  });
});

// ---------------------------------------------------------------------------
// respondToRequest + parent approval (full lifecycle)
// ---------------------------------------------------------------------------

describe("respondToRequest", () => {
  it("accepts straight to 'accepted' when no approvals are required", async () => {
    const p = await pair();
    const created = await createFriendRequest(t.serviceDb, reqInput(p));
    const row = await respondToRequest(t.serviceDb, {
      accountId: p.accB,
      kidId: p.kidB,
      friendshipId: created.id,
      action: "accept",
      addresseeCard: ADDR_CARD,
    });
    expect(row.status).toBe("accepted");
    expect(row.addressee_card).toBe(ADDR_CARD);
  });

  it("accepts into 'awaiting_parent' when the addressee requires approval", async () => {
    const p = await pair({}, { incoming_friend_requests_require_parent_approval: true });
    const created = await createFriendRequest(t.serviceDb, reqInput(p));
    const row = await respondToRequest(t.serviceDb, {
      accountId: p.accB,
      kidId: p.kidB,
      friendshipId: created.id,
      action: "accept",
      addresseeCard: ADDR_CARD,
    });
    expect(row.status).toBe("awaiting_parent");

    const approved = await setParentApproval(t.serviceDb, {
      accountId: p.accB,
      friendshipId: created.id,
      side: "addressee",
      approve: true,
    });
    expect(approved.status).toBe("accepted");
  });

  it("keeps an accepted-but-awaiting request visible to the addressee", async () => {
    const p = await pair({}, { incoming_friend_requests_require_parent_approval: true });
    const created = await createFriendRequest(t.serviceDb, reqInput(p));
    await respondToRequest(t.serviceDb, {
      accountId: p.accB,
      kidId: p.kidB,
      friendshipId: created.id,
      action: "accept",
      addresseeCard: ADDR_CARD,
    });
    // The kid accepted; it's awaiting a parent. It must NOT vanish from their view.
    const incoming = await listRequests(t.serviceDb, {
      accountId: p.accB,
      kidId: p.kidB,
      direction: "incoming",
    });
    expect(incoming).toHaveLength(1);
    expect(incoming[0].status).toBe("awaiting_parent");
    // The addressee's own parent is the one still pending.
    expect(incoming[0].myParentPending).toBe(true);
  });

  it("requires both parents' approval when both sides opt in", async () => {
    const p = await pair(
      { outgoing_friend_requests_require_parent_approval: true },
      { incoming_friend_requests_require_parent_approval: true },
    );
    const created = await createFriendRequest(t.serviceDb, reqInput(p));
    await respondToRequest(t.serviceDb, {
      accountId: p.accB,
      kidId: p.kidB,
      friendshipId: created.id,
      action: "accept",
      addresseeCard: ADDR_CARD,
    });
    const afterOne = await setParentApproval(t.serviceDb, {
      accountId: p.accA,
      friendshipId: created.id,
      side: "requester",
      approve: true,
    });
    expect(afterOne.status).toBe("awaiting_parent"); // addressee parent still pending
    const afterTwo = await setParentApproval(t.serviceDb, {
      accountId: p.accB,
      friendshipId: created.id,
      side: "addressee",
      approve: true,
    });
    expect(afterTwo.status).toBe("accepted");
  });

  it("rejects a request", async () => {
    const p = await pair();
    const created = await createFriendRequest(t.serviceDb, reqInput(p));
    const row = await respondToRequest(t.serviceDb, {
      accountId: p.accB,
      kidId: p.kidB,
      friendshipId: created.id,
      action: "reject",
    });
    expect(row.status).toBe("rejected");
  });

  it("lets a parent veto an awaiting friendship", async () => {
    const p = await pair({}, { incoming_friend_requests_require_parent_approval: true });
    const created = await createFriendRequest(t.serviceDb, reqInput(p));
    await respondToRequest(t.serviceDb, {
      accountId: p.accB,
      kidId: p.kidB,
      friendshipId: created.id,
      action: "accept",
      addresseeCard: ADDR_CARD,
    });
    const vetoed = await setParentApproval(t.serviceDb, {
      accountId: p.accB,
      friendshipId: created.id,
      side: "addressee",
      approve: false,
    });
    expect(vetoed.status).toBe("rejected");
  });

  it("forbids a non-addressee from responding", async () => {
    const p = await pair();
    const created = await createFriendRequest(t.serviceDb, reqInput(p));
    await expect(
      respondToRequest(t.serviceDb, {
        accountId: p.accA,
        kidId: p.kidA,
        friendshipId: created.id,
        action: "accept",
        addresseeCard: ADDR_CARD,
      }),
    ).rejects.toThrow(/Not authorized/);
  });

  it("forbids approving a side that does not require approval", async () => {
    const p = await pair();
    const created = await createFriendRequest(t.serviceDb, reqInput(p));
    await expect(
      setParentApproval(t.serviceDb, {
        accountId: p.accA,
        friendshipId: created.id,
        side: "requester",
        approve: true,
      }),
    ).rejects.toThrow(/does not require parent approval/);
  });
});

// ---------------------------------------------------------------------------
// block / unblock
// ---------------------------------------------------------------------------

describe("block / unblock", () => {
  it("blocks an accepted friendship and records the blocker", async () => {
    const p = await pair();
    const id = await accepted(p);
    const row = await blockFriend(t.serviceDb, {
      accountId: p.accA,
      kidId: p.kidA,
      friendshipId: id,
    });
    expect(row.status).toBe("blocked");
    expect(row.blocked_by).toBe(p.kidA);
  });

  it("attributes a block to the acting sibling on a shared account", async () => {
    // L (requester) and A (addressee) are two kids on the SAME account.
    const acc = await account();
    const kidL = await kid(acc, { social_id: "lin" });
    const kidA = await kid(acc, { social_id: "ada" });
    const created = await createFriendRequest(t.serviceDb, {
      requesterAccountId: acc,
      requesterKidId: kidL,
      targetKidId: kidA,
      previewCard: PREVIEW,
      fullCard: FULL,
      nickname: "enc:v1:nick",
    });
    await respondToRequest(t.serviceDb, {
      accountId: acc,
      kidId: kidA,
      friendshipId: created.id,
      action: "accept",
      addresseeCard: ADDR_CARD,
    });
    // A blocks L — must be attributed to A (the actor), not the requester side.
    const blocked = await blockFriend(t.serviceDb, {
      accountId: acc,
      kidId: kidA,
      friendshipId: created.id,
    });
    expect(blocked.blocked_by).toBe(kidA);
    // A sees it under blocked; L does not.
    expect(await listBlocked(t.serviceDb, { accountId: acc, kidId: kidA })).toHaveLength(1);
    expect(await listBlocked(t.serviceDb, { accountId: acc, kidId: kidL })).toHaveLength(0);
  });

  it("prevents a new request while blocked", async () => {
    const p = await pair();
    const id = await accepted(p);
    await blockFriend(t.serviceDb, { accountId: p.accA, kidId: p.kidA, friendshipId: id });
    await expect(createFriendRequest(t.serviceDb, reqInput(p))).rejects.toThrow(
      "friendship_blocked",
    );
  });

  it("removeFriendship deletes an accepted friendship and frees the pair", async () => {
    const p = await pair();
    const id = await accepted(p);
    const before = await friendshipCount();
    await removeFriendship(t.serviceDb, { accountId: p.accB, kidId: p.kidB, friendshipId: id });
    expect(await friendshipCount()).toBe(before - 1);
    await expect(createFriendRequest(t.serviceDb, reqInput(p))).resolves.toBeTruthy();
  });

  it("removeFriendship refuses a blocked row (must unblock)", async () => {
    const p = await pair();
    const id = await accepted(p);
    await blockFriend(t.serviceDb, { accountId: p.accA, kidId: p.kidA, friendshipId: id });
    await expect(
      removeFriendship(t.serviceDb, { accountId: p.accA, kidId: p.kidA, friendshipId: id }),
    ).rejects.toThrow(/Unblock/);
  });

  it("only lets the blocker unblock, and unblocking frees the pair", async () => {
    const p = await pair();
    const id = await accepted(p);
    await blockFriend(t.serviceDb, { accountId: p.accA, kidId: p.kidA, friendshipId: id });
    await expect(
      unblockFriend(t.serviceDb, { accountId: p.accB, kidId: p.kidB, friendshipId: id }),
    ).rejects.toThrow(/Only the kid who blocked/);
    const before = await friendshipCount();
    await unblockFriend(t.serviceDb, { accountId: p.accA, kidId: p.kidA, friendshipId: id });
    expect(await friendshipCount()).toBe(before - 1);
    // pair is free again
    await expect(createFriendRequest(t.serviceDb, reqInput(p))).resolves.toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// read views + card gating
// ---------------------------------------------------------------------------

describe("views and card-delivery gating", () => {
  it("gives the addressee only the preview while pending, the full card once accepted", async () => {
    const p = await pair({ social_id: "ann" }, { social_id: "ben" });
    const created = await createFriendRequest(t.serviceDb, reqInput(p));

    const pendingIn = await listRequests(t.serviceDb, {
      accountId: p.accB,
      kidId: p.kidB,
      direction: "incoming",
    });
    expect(pendingIn).toHaveLength(1);
    expect(pendingIn[0].card).toBe(PREVIEW);
    expect(pendingIn[0].cardKind).toBe("preview");
    expect(pendingIn[0].counterpartSocialId).toBe("ann");

    // The requester learns nothing about the addressee while pending.
    const pendingOut = await listRequests(t.serviceDb, {
      accountId: p.accA,
      kidId: p.kidA,
      direction: "outgoing",
    });
    expect(pendingOut[0].card).toBeNull();

    await respondToRequest(t.serviceDb, {
      accountId: p.accB,
      kidId: p.kidB,
      friendshipId: created.id,
      action: "accept",
      addresseeCard: ADDR_CARD,
    });

    const friendsOfA = await listFriends(t.serviceDb, { accountId: p.accA, kidId: p.kidA });
    expect(friendsOfA[0].card).toBe(ADDR_CARD); // requester now gets addressee's full card
    expect(friendsOfA[0].cardKind).toBe("full");

    const friendsOfB = await listFriends(t.serviceDb, { accountId: p.accB, kidId: p.kidB });
    expect(friendsOfB[0].card).toBe(FULL); // addressee now gets requester's full card
    expect(friendsOfB[0].cardKind).toBe("full");
  });

  it("hides rows from an account that does not own the kid's side", async () => {
    const p = await pair();
    await accepted(p);
    const evil = await account();
    expect(await listFriends(t.serviceDb, { accountId: evil, kidId: p.kidA })).toEqual([]);
  });

  it("exposes the counterpart's KEM key so the addressee can seal a reply", async () => {
    const p = await pair({ friend_kem_public_key: "kem-a" }, { friend_kem_public_key: "kem-b" });
    await createFriendRequest(t.serviceDb, reqInput(p));
    const incoming = await listRequests(t.serviceDb, {
      accountId: p.accB,
      kidId: p.kidB,
      direction: "incoming",
    });
    expect(incoming[0].counterpartKemPublicKey).toBe("kem-a");
  });

  it("delivers the requester's private nickname only to the requester", async () => {
    const p = await pair();
    await createFriendRequest(t.serviceDb, reqInput(p, { nickname: "enc:v1:my-nick" }));
    const outgoing = await listRequests(t.serviceDb, {
      accountId: p.accA,
      kidId: p.kidA,
      direction: "outgoing",
    });
    expect(outgoing[0].nickname).toBe("enc:v1:my-nick");
    const incoming = await listRequests(t.serviceDb, {
      accountId: p.accB,
      kidId: p.kidB,
      direction: "incoming",
    });
    expect(incoming[0].nickname).toBeNull();
  });

  it("surfaces awaiting-parent friendships to the right parent", async () => {
    const p = await pair(
      {},
      { social_id: "ben-awaiting", incoming_friend_requests_require_parent_approval: true },
    );
    const created = await createFriendRequest(t.serviceDb, reqInput(p));
    await respondToRequest(t.serviceDb, {
      accountId: p.accB,
      kidId: p.kidB,
      friendshipId: created.id,
      action: "accept",
      addresseeCard: ADDR_CARD,
    });
    const approvals = await listPendingApprovals(t.serviceDb, p.accB);
    expect(approvals).toHaveLength(1);
    expect(approvals[0].side).toBe("addressee");
    expect(approvals[0].kidId).toBe(p.kidB);
    // Incoming approval carries the requester's sealed preview card + sign key
    // so the parent can decrypt the requester's name client-side.
    expect(approvals[0].previewCard).toBe(PREVIEW);
    expect(approvals[0].counterpartSignPublicKey).toBe("sign-x");
    expect(approvals[0].nickname).toBeNull();
    // The requester's parent has nothing to approve.
    expect(await listPendingApprovals(t.serviceDb, p.accA)).toHaveLength(0);
  });

  it("re-seals the requester's card so an accepted friend sees the new data", async () => {
    // Reproduces the stale-friend-list bug: a friend keeps seeing the snapshot
    // card until the owner re-seals it. After refresh, the new card is delivered.
    const p = await pair({ friend_kem_public_key: "kem-a" }, { friend_kem_public_key: "kem-b" });
    const id = await accepted(p);

    // A (requester) edits its avatar/name → re-seals to every friend.
    const targets = await listCardRefreshTargets(t.serviceDb, {
      accountId: p.accA,
      kidId: p.kidA,
    });
    expect(targets).toEqual([
      { friendshipId: id, side: "requester", counterpartKemPublicKey: "kem-b" },
    ]);

    const NEW_PREVIEW = JSON.stringify({ preview: "v2" });
    const NEW_FULL = JSON.stringify({ full: "v2" });
    const n = await refreshFriendCards(t.serviceDb, {
      accountId: p.accA,
      kidId: p.kidA,
      cards: [{ friendshipId: id, previewCard: NEW_PREVIEW, card: NEW_FULL }],
    });
    expect(n).toBe(1);

    // The addressee's friend list now reads the refreshed card, not the snapshot.
    const friendsOfB = await listFriends(t.serviceDb, { accountId: p.accB, kidId: p.kidB });
    expect(friendsOfB[0].card).toBe(NEW_FULL);
  });

  it("re-seals the addressee's card so the requester sees the new data", async () => {
    const p = await pair({ friend_kem_public_key: "kem-a" }, { friend_kem_public_key: "kem-b" });
    const id = await accepted(p);

    const targets = await listCardRefreshTargets(t.serviceDb, {
      accountId: p.accB,
      kidId: p.kidB,
    });
    expect(targets[0]).toMatchObject({ side: "addressee", counterpartKemPublicKey: "kem-a" });

    const NEW_ADDR = JSON.stringify({ addressee: "v2" });
    await refreshFriendCards(t.serviceDb, {
      accountId: p.accB,
      kidId: p.kidB,
      cards: [{ friendshipId: id, card: NEW_ADDR }],
    });
    const friendsOfA = await listFriends(t.serviceDb, { accountId: p.accA, kidId: p.kidA });
    expect(friendsOfA[0].card).toBe(NEW_ADDR);
  });

  it("refreshes the preview a pending addressee sees, before acceptance", async () => {
    const p = await pair({ social_id: "ann2" }, { social_id: "ben2" });
    const created = await createFriendRequest(t.serviceDb, reqInput(p));
    const NEW_PREVIEW = JSON.stringify({ preview: "v2" });
    await refreshFriendCards(t.serviceDb, {
      accountId: p.accA,
      kidId: p.kidA,
      cards: [
        { friendshipId: created.id, previewCard: NEW_PREVIEW, card: JSON.stringify({ full: "v2" }) },
      ],
    });
    const incoming = await listRequests(t.serviceDb, {
      accountId: p.accB,
      kidId: p.kidB,
      direction: "incoming",
    });
    expect(incoming[0].card).toBe(NEW_PREVIEW);
  });

  it("has no addressee card to refresh before the kid accepts", async () => {
    const p = await pair();
    const created = await createFriendRequest(t.serviceDb, reqInput(p));
    expect(
      await listCardRefreshTargets(t.serviceDb, { accountId: p.accB, kidId: p.kidB }),
    ).toHaveLength(0);
    const n = await refreshFriendCards(t.serviceDb, {
      accountId: p.accB,
      kidId: p.kidB,
      cards: [{ friendshipId: created.id, card: "x" }],
    });
    expect(n).toBe(0);
  });

  it("won't let a non-participant overwrite a card", async () => {
    const p = await pair();
    const id = await accepted(p);
    const evilAcc = await account();
    const evilKid = await kid(evilAcc);
    const n = await refreshFriendCards(t.serviceDb, {
      accountId: evilAcc,
      kidId: evilKid,
      cards: [{ friendshipId: id, previewCard: "x", card: "x" }],
    });
    expect(n).toBe(0);
    const friendsOfB = await listFriends(t.serviceDb, { accountId: p.accB, kidId: p.kidB });
    expect(friendsOfB[0].card).toBe(FULL); // untouched
  });

  it("gives an outgoing approval the kid's nickname to decrypt", async () => {
    const p = await pair(
      { outgoing_friend_requests_require_parent_approval: true },
      { social_id: "ben3" },
    );
    const created = await createFriendRequest(
      t.serviceDb,
      reqInput(p, { nickname: "enc:v1:tom" }),
    );
    await respondToRequest(t.serviceDb, {
      accountId: p.accB,
      kidId: p.kidB,
      friendshipId: created.id,
      action: "accept",
      addresseeCard: ADDR_CARD,
    });
    const approvals = await listPendingApprovals(t.serviceDb, p.accA);
    expect(approvals).toHaveLength(1);
    expect(approvals[0].side).toBe("requester");
    expect(approvals[0].nickname).toBe("enc:v1:tom");
    expect(approvals[0].previewCard).toBeNull();
  });
});

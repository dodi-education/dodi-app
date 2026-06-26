import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import type { Database, Friendship, Profile } from "@dodi/types/database";

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

// ---------------------------------------------------------------------------
// Minimal in-memory fake of the Supabase query builder — supports only the
// chains the friends service uses (eq/in/or/order + maybeSingle/single/insert/
// update/delete + awaiting the builder as a thenable).
// ---------------------------------------------------------------------------

interface Store {
  profiles: Profile[];
  friendships: Friendship[];
}

class FakeBuilder {
  private mode: "select" | "insert" | "update" | "delete" = "select";
  private payload: Record<string, unknown> | null = null;
  private wantsRows = false;
  private eqs: Array<[string, unknown]> = [];
  private ins: Array<[string, unknown[]]> = [];
  private ors: string[] = [];
  private cached: { data: unknown; error: { code?: string; message: string } | null } | null = null;

  constructor(
    private store: Store,
    private table: "profiles" | "friendships",
  ) {}

  select(_cols?: string) {
    this.wantsRows = true;
    return this;
  }
  insert(obj: Record<string, unknown>) {
    this.mode = "insert";
    this.payload = obj;
    return this;
  }
  update(obj: Record<string, unknown>) {
    this.mode = "update";
    this.payload = obj;
    return this;
  }
  delete() {
    this.mode = "delete";
    return this;
  }
  eq(col: string, val: unknown) {
    this.eqs.push([col, val]);
    return this;
  }
  in(col: string, arr: unknown[]) {
    this.ins.push([col, arr]);
    return this;
  }
  or(str: string) {
    this.ors.push(str);
    return this;
  }
  order() {
    return this;
  }

  private matches(row: Record<string, unknown>): boolean {
    for (const [c, v] of this.eqs) if (row[c] !== v) return false;
    for (const [c, arr] of this.ins) if (!arr.includes(row[c])) return false;
    for (const orStr of this.ors) {
      const terms = orStr.split(",").map((t) => {
        const i = t.indexOf(".eq.");
        return [t.slice(0, i), t.slice(i + 4)] as const;
      });
      if (!terms.some(([c, v]) => String(row[c as string]) === v)) return false;
    }
    return true;
  }

  private rows(): Record<string, unknown>[] {
    return this.store[this.table] as unknown as Record<string, unknown>[];
  }

  private run() {
    if (this.cached) return this.cached;
    if (this.mode === "insert") {
      const row = {
        id: `id-${this.table}-${this.rows().length + 1}`,
        created_at: "t0",
        updated_at: "t0",
        ...this.payload,
      };
      this.rows().push(row);
      this.cached = { data: this.wantsRows ? [row] : null, error: null };
    } else if (this.mode === "update") {
      const matched = this.rows().filter((r) => this.matches(r));
      for (const r of matched) Object.assign(r, this.payload);
      this.cached = { data: this.wantsRows ? matched : null, error: null };
    } else if (this.mode === "delete") {
      const keep = this.rows().filter((r) => !this.matches(r));
      this.store[this.table] = keep as never;
      this.cached = { data: null, error: null };
    } else {
      this.cached = { data: this.rows().filter((r) => this.matches(r)), error: null };
    }
    return this.cached;
  }

  async maybeSingle() {
    const { data, error } = this.run();
    const arr = (data as unknown[]) ?? [];
    return { data: arr[0] ?? null, error };
  }
  async single() {
    const { data, error } = this.run();
    const arr = (data as unknown[]) ?? [];
    if (arr.length === 0) {
      return { data: null, error: error ?? { code: "PGRST116", message: "no rows" } };
    }
    return { data: arr[0], error: null };
  }
  then<T>(resolve: (v: { data: unknown; error: unknown }) => T) {
    return Promise.resolve(this.run()).then(resolve);
  }
}

function fakeClient(store: Store): SupabaseClient<Database> {
  return {
    from: (table: "profiles" | "friendships") => new FakeBuilder(store, table),
  } as unknown as SupabaseClient<Database>;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function profile(overrides: Partial<Profile>): Profile {
  return {
    id: "p-x",
    account_id: "acc-x",
    display_name: "enc:v1:name",
    social_id: "handle-x",
    birthdate: null,
    avatar_config: null,
    avatar_pin: null,
    active_persona_id: null,
    memory: null,
    parent_notes: null,
    language: "en",
    date_preferences: null,
    friend_kem_public_key: "kem-x",
    friend_sign_public_key: "sign-x",
    friend_secret_keys: "enc:v1:secret",
    can_add_friends: true,
    can_be_added_as_friend: true,
    incoming_friend_requests_require_parent_approval: false,
    outgoing_friend_requests_require_parent_approval: false,
    created_at: "t0",
    updated_at: "t0",
    ...overrides,
  };
}

const PREVIEW = JSON.stringify({ preview: true });
const FULL = JSON.stringify({ full: true });
const ADDR_CARD = JSON.stringify({ addressee: true });

function setup(profiles: Profile[], friendships: Friendship[] = []): Store {
  return { profiles, friendships };
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
  it("returns public keys for a discoverable profile", async () => {
    const store = setup([profile({ id: "p1", social_id: "emma" })]);
    const t = await lookupFriendTarget(fakeClient(store), "emma");
    expect(t).toEqual({ profileId: "p1", kemPublicKey: "kem-x", signPublicKey: "sign-x" });
  });
  it("hides a profile that cannot be added", async () => {
    const store = setup([profile({ id: "p1", social_id: "emma", can_be_added_as_friend: false })]);
    expect(await lookupFriendTarget(fakeClient(store), "emma")).toBeNull();
  });
  it("hides a profile with no published keys", async () => {
    const store = setup([
      profile({ id: "p1", social_id: "emma", friend_kem_public_key: null }),
    ]);
    expect(await lookupFriendTarget(fakeClient(store), "emma")).toBeNull();
  });
  it("returns null for an unknown handle", async () => {
    const store = setup([profile({ id: "p1", social_id: "emma" })]);
    expect(await lookupFriendTarget(fakeClient(store), "nobody")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// createFriendRequest
// ---------------------------------------------------------------------------

function reqInput(over: Partial<Parameters<typeof createFriendRequest>[1]> = {}) {
  return {
    requesterAccountId: "acc-a",
    requesterProfileId: "p-a",
    targetProfileId: "p-b",
    previewCard: PREVIEW,
    fullCard: FULL,
    nickname: "enc:v1:nick",
    ...over,
  };
}

describe("createFriendRequest", () => {
  it("creates a pending request and sets tri-state approval from settings", async () => {
    const store = setup([
      profile({
        id: "p-a",
        account_id: "acc-a",
        outgoing_friend_requests_require_parent_approval: true,
      }),
      profile({ id: "p-b", account_id: "acc-b" }),
    ]);
    const row = await createFriendRequest(fakeClient(store), reqInput());
    expect(row.status).toBe("pending");
    expect(row.requester_parent_ok).toBe(false); // requester's outgoing requires approval
    expect(row.addressee_parent_ok).toBeNull(); // addressee's incoming does not
    expect(row.requester_preview_card).toBe(PREVIEW);
    expect(row.requester_card).toBe(FULL);
    expect(row.addressee_account_id).toBe("acc-b");
  });

  it("refuses when the requester may not initiate", async () => {
    const store = setup([
      profile({ id: "p-a", account_id: "acc-a", can_add_friends: false }),
      profile({ id: "p-b", account_id: "acc-b" }),
    ]);
    await expect(createFriendRequest(fakeClient(store), reqInput())).rejects.toThrow(
      "cannot_initiate",
    );
  });

  it("refuses when the target may not be added", async () => {
    const store = setup([
      profile({ id: "p-a", account_id: "acc-a" }),
      profile({ id: "p-b", account_id: "acc-b", can_be_added_as_friend: false }),
    ]);
    await expect(createFriendRequest(fakeClient(store), reqInput())).rejects.toThrow(
      "target_unavailable",
    );
  });

  it("rejects a request to a profile the account does not own", async () => {
    const store = setup([
      profile({ id: "p-a", account_id: "acc-a" }),
      profile({ id: "p-b", account_id: "acc-b" }),
    ]);
    await expect(
      createFriendRequest(fakeClient(store), reqInput({ requesterAccountId: "acc-evil" })),
    ).rejects.toThrow("requester_not_found");
  });

  it("reports a duplicate pending request as request_exists", async () => {
    const store = setup([
      profile({ id: "p-a", account_id: "acc-a" }),
      profile({ id: "p-b", account_id: "acc-b" }),
    ]);
    await createFriendRequest(fakeClient(store), reqInput());
    await expect(createFriendRequest(fakeClient(store), reqInput())).rejects.toThrow(
      "request_exists",
    );
  });

  it("reports an existing accepted friendship as already_friends", async () => {
    const store = setup([
      profile({ id: "p-a", account_id: "acc-a" }),
      profile({ id: "p-b", account_id: "acc-b" }),
    ]);
    const created = await createFriendRequest(fakeClient(store), reqInput());
    await respondToRequest(fakeClient(store), {
      accountId: "acc-b",
      profileId: "p-b",
      friendshipId: created.id,
      action: "accept",
      addresseeCard: ADDR_CARD,
    });
    await expect(createFriendRequest(fakeClient(store), reqInput())).rejects.toThrow(
      "already_friends",
    );
  });
});

// ---------------------------------------------------------------------------
// respondToRequest + parent approval (full lifecycle)
// ---------------------------------------------------------------------------

describe("respondToRequest", () => {
  it("accepts straight to 'accepted' when no approvals are required", async () => {
    const store = setup([
      profile({ id: "p-a", account_id: "acc-a" }),
      profile({ id: "p-b", account_id: "acc-b" }),
    ]);
    const created = await createFriendRequest(fakeClient(store), reqInput());
    const row = await respondToRequest(fakeClient(store), {
      accountId: "acc-b",
      profileId: "p-b",
      friendshipId: created.id,
      action: "accept",
      addresseeCard: ADDR_CARD,
    });
    expect(row.status).toBe("accepted");
    expect(row.addressee_card).toBe(ADDR_CARD);
  });

  it("accepts into 'awaiting_parent' when the addressee requires approval", async () => {
    const store = setup([
      profile({ id: "p-a", account_id: "acc-a" }),
      profile({
        id: "p-b",
        account_id: "acc-b",
        incoming_friend_requests_require_parent_approval: true,
      }),
    ]);
    const created = await createFriendRequest(fakeClient(store), reqInput());
    const row = await respondToRequest(fakeClient(store), {
      accountId: "acc-b",
      profileId: "p-b",
      friendshipId: created.id,
      action: "accept",
      addresseeCard: ADDR_CARD,
    });
    expect(row.status).toBe("awaiting_parent");

    const approved = await setParentApproval(fakeClient(store), {
      accountId: "acc-b",
      friendshipId: created.id,
      side: "addressee",
      approve: true,
    });
    expect(approved.status).toBe("accepted");
  });

  it("keeps an accepted-but-awaiting request visible to the addressee", async () => {
    const store = setup([
      profile({ id: "p-a", account_id: "acc-a" }),
      profile({
        id: "p-b",
        account_id: "acc-b",
        incoming_friend_requests_require_parent_approval: true,
      }),
    ]);
    const created = await createFriendRequest(fakeClient(store), reqInput());
    await respondToRequest(fakeClient(store), {
      accountId: "acc-b",
      profileId: "p-b",
      friendshipId: created.id,
      action: "accept",
      addresseeCard: ADDR_CARD,
    });
    // The kid accepted; it's awaiting a parent. It must NOT vanish from their view.
    const incoming = await listRequests(fakeClient(store), {
      accountId: "acc-b",
      profileId: "p-b",
      direction: "incoming",
    });
    expect(incoming).toHaveLength(1);
    expect(incoming[0].status).toBe("awaiting_parent");
    // The addressee's own parent is the one still pending.
    expect(incoming[0].myParentPending).toBe(true);
  });

  it("requires both parents' approval when both sides opt in", async () => {
    const store = setup([
      profile({
        id: "p-a",
        account_id: "acc-a",
        outgoing_friend_requests_require_parent_approval: true,
      }),
      profile({
        id: "p-b",
        account_id: "acc-b",
        incoming_friend_requests_require_parent_approval: true,
      }),
    ]);
    const created = await createFriendRequest(fakeClient(store), reqInput());
    await respondToRequest(fakeClient(store), {
      accountId: "acc-b",
      profileId: "p-b",
      friendshipId: created.id,
      action: "accept",
      addresseeCard: ADDR_CARD,
    });
    const afterOne = await setParentApproval(fakeClient(store), {
      accountId: "acc-a",
      friendshipId: created.id,
      side: "requester",
      approve: true,
    });
    expect(afterOne.status).toBe("awaiting_parent"); // addressee parent still pending
    const afterTwo = await setParentApproval(fakeClient(store), {
      accountId: "acc-b",
      friendshipId: created.id,
      side: "addressee",
      approve: true,
    });
    expect(afterTwo.status).toBe("accepted");
  });

  it("rejects a request", async () => {
    const store = setup([
      profile({ id: "p-a", account_id: "acc-a" }),
      profile({ id: "p-b", account_id: "acc-b" }),
    ]);
    const created = await createFriendRequest(fakeClient(store), reqInput());
    const row = await respondToRequest(fakeClient(store), {
      accountId: "acc-b",
      profileId: "p-b",
      friendshipId: created.id,
      action: "reject",
    });
    expect(row.status).toBe("rejected");
  });

  it("lets a parent veto an awaiting friendship", async () => {
    const store = setup([
      profile({ id: "p-a", account_id: "acc-a" }),
      profile({
        id: "p-b",
        account_id: "acc-b",
        incoming_friend_requests_require_parent_approval: true,
      }),
    ]);
    const created = await createFriendRequest(fakeClient(store), reqInput());
    await respondToRequest(fakeClient(store), {
      accountId: "acc-b",
      profileId: "p-b",
      friendshipId: created.id,
      action: "accept",
      addresseeCard: ADDR_CARD,
    });
    const vetoed = await setParentApproval(fakeClient(store), {
      accountId: "acc-b",
      friendshipId: created.id,
      side: "addressee",
      approve: false,
    });
    expect(vetoed.status).toBe("rejected");
  });

  it("forbids a non-addressee from responding", async () => {
    const store = setup([
      profile({ id: "p-a", account_id: "acc-a" }),
      profile({ id: "p-b", account_id: "acc-b" }),
    ]);
    const created = await createFriendRequest(fakeClient(store), reqInput());
    await expect(
      respondToRequest(fakeClient(store), {
        accountId: "acc-a",
        profileId: "p-a",
        friendshipId: created.id,
        action: "accept",
        addresseeCard: ADDR_CARD,
      }),
    ).rejects.toThrow(/Not authorized/);
  });

  it("forbids approving a side that does not require approval", async () => {
    const store = setup([
      profile({ id: "p-a", account_id: "acc-a" }),
      profile({ id: "p-b", account_id: "acc-b" }),
    ]);
    const created = await createFriendRequest(fakeClient(store), reqInput());
    await expect(
      setParentApproval(fakeClient(store), {
        accountId: "acc-a",
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
  async function accepted(store: Store) {
    const created = await createFriendRequest(fakeClient(store), reqInput());
    await respondToRequest(fakeClient(store), {
      accountId: "acc-b",
      profileId: "p-b",
      friendshipId: created.id,
      action: "accept",
      addresseeCard: ADDR_CARD,
    });
    return created.id;
  }

  it("blocks an accepted friendship and records the blocker", async () => {
    const store = setup([
      profile({ id: "p-a", account_id: "acc-a" }),
      profile({ id: "p-b", account_id: "acc-b" }),
    ]);
    const id = await accepted(store);
    const row = await blockFriend(fakeClient(store), { accountId: "acc-a", profileId: "p-a", friendshipId: id });
    expect(row.status).toBe("blocked");
    expect(row.blocked_by).toBe("p-a");
  });

  it("attributes a block to the acting sibling on a shared account", async () => {
    // L (requester) and A (addressee) are two kids on the SAME account.
    const store = setup([
      profile({ id: "p-l", account_id: "acc-1", social_id: "lin" }),
      profile({ id: "p-a", account_id: "acc-1", social_id: "ada" }),
    ]);
    const created = await createFriendRequest(fakeClient(store), {
      requesterAccountId: "acc-1",
      requesterProfileId: "p-l",
      targetProfileId: "p-a",
      previewCard: PREVIEW,
      fullCard: FULL,
      nickname: "enc:v1:nick",
    });
    await respondToRequest(fakeClient(store), {
      accountId: "acc-1",
      profileId: "p-a",
      friendshipId: created.id,
      action: "accept",
      addresseeCard: ADDR_CARD,
    });
    // A blocks L — must be attributed to A (the actor), not the requester side.
    const blocked = await blockFriend(fakeClient(store), {
      accountId: "acc-1",
      profileId: "p-a",
      friendshipId: created.id,
    });
    expect(blocked.blocked_by).toBe("p-a");
    // A sees it under blocked; L does not.
    expect(
      await listBlocked(fakeClient(store), { accountId: "acc-1", profileId: "p-a" }),
    ).toHaveLength(1);
    expect(
      await listBlocked(fakeClient(store), { accountId: "acc-1", profileId: "p-l" }),
    ).toHaveLength(0);
  });

  it("prevents a new request while blocked", async () => {
    const store = setup([
      profile({ id: "p-a", account_id: "acc-a" }),
      profile({ id: "p-b", account_id: "acc-b" }),
    ]);
    const id = await accepted(store);
    await blockFriend(fakeClient(store), { accountId: "acc-a", profileId: "p-a", friendshipId: id });
    await expect(createFriendRequest(fakeClient(store), reqInput())).rejects.toThrow(
      "friendship_blocked",
    );
  });

  it("removeFriendship deletes an accepted friendship and frees the pair", async () => {
    const store = setup([
      profile({ id: "p-a", account_id: "acc-a" }),
      profile({ id: "p-b", account_id: "acc-b" }),
    ]);
    const id = await accepted(store);
    await removeFriendship(fakeClient(store), { accountId: "acc-b", profileId: "p-b", friendshipId: id });
    expect(store.friendships).toHaveLength(0);
    await expect(createFriendRequest(fakeClient(store), reqInput())).resolves.toBeTruthy();
  });

  it("removeFriendship refuses a blocked row (must unblock)", async () => {
    const store = setup([
      profile({ id: "p-a", account_id: "acc-a" }),
      profile({ id: "p-b", account_id: "acc-b" }),
    ]);
    const id = await accepted(store);
    await blockFriend(fakeClient(store), { accountId: "acc-a", profileId: "p-a", friendshipId: id });
    await expect(
      removeFriendship(fakeClient(store), { accountId: "acc-a", profileId: "p-a", friendshipId: id }),
    ).rejects.toThrow(/Unblock/);
  });

  it("only lets the blocker unblock, and unblocking frees the pair", async () => {
    const store = setup([
      profile({ id: "p-a", account_id: "acc-a" }),
      profile({ id: "p-b", account_id: "acc-b" }),
    ]);
    const id = await accepted(store);
    await blockFriend(fakeClient(store), { accountId: "acc-a", profileId: "p-a", friendshipId: id });
    await expect(
      unblockFriend(fakeClient(store), { accountId: "acc-b", profileId: "p-b", friendshipId: id }),
    ).rejects.toThrow(/Only the kid who blocked/);
    await unblockFriend(fakeClient(store), { accountId: "acc-a", profileId: "p-a", friendshipId: id });
    expect(store.friendships).toHaveLength(0);
    // pair is free again
    await expect(createFriendRequest(fakeClient(store), reqInput())).resolves.toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// read views + card gating
// ---------------------------------------------------------------------------

describe("views and card-delivery gating", () => {
  it("gives the addressee only the preview while pending, the full card once accepted", async () => {
    const store = setup([
      profile({ id: "p-a", account_id: "acc-a", social_id: "ann" }),
      profile({ id: "p-b", account_id: "acc-b", social_id: "ben" }),
    ]);
    const created = await createFriendRequest(fakeClient(store), reqInput());

    const pendingIn = await listRequests(fakeClient(store), {
      accountId: "acc-b",
      profileId: "p-b",
      direction: "incoming",
    });
    expect(pendingIn).toHaveLength(1);
    expect(pendingIn[0].card).toBe(PREVIEW);
    expect(pendingIn[0].cardKind).toBe("preview");
    expect(pendingIn[0].counterpartSocialId).toBe("ann");

    // The requester learns nothing about the addressee while pending.
    const pendingOut = await listRequests(fakeClient(store), {
      accountId: "acc-a",
      profileId: "p-a",
      direction: "outgoing",
    });
    expect(pendingOut[0].card).toBeNull();

    await respondToRequest(fakeClient(store), {
      accountId: "acc-b",
      profileId: "p-b",
      friendshipId: created.id,
      action: "accept",
      addresseeCard: ADDR_CARD,
    });

    const friendsOfA = await listFriends(fakeClient(store), {
      accountId: "acc-a",
      profileId: "p-a",
    });
    expect(friendsOfA[0].card).toBe(ADDR_CARD); // requester now gets addressee's full card
    expect(friendsOfA[0].cardKind).toBe("full");

    const friendsOfB = await listFriends(fakeClient(store), {
      accountId: "acc-b",
      profileId: "p-b",
    });
    expect(friendsOfB[0].card).toBe(FULL); // addressee now gets requester's full card
    expect(friendsOfB[0].cardKind).toBe("full");
  });

  it("exposes the counterpart's KEM key so the addressee can seal a reply", async () => {
    const store = setup([
      profile({ id: "p-a", account_id: "acc-a", friend_kem_public_key: "kem-a" }),
      profile({ id: "p-b", account_id: "acc-b", friend_kem_public_key: "kem-b" }),
    ]);
    await createFriendRequest(fakeClient(store), reqInput());
    const incoming = await listRequests(fakeClient(store), {
      accountId: "acc-b",
      profileId: "p-b",
      direction: "incoming",
    });
    expect(incoming[0].counterpartKemPublicKey).toBe("kem-a");
  });

  it("delivers the requester's private nickname only to the requester", async () => {
    const store = setup([
      profile({ id: "p-a", account_id: "acc-a" }),
      profile({ id: "p-b", account_id: "acc-b" }),
    ]);
    await createFriendRequest(
      fakeClient(store),
      reqInput({ nickname: "enc:v1:my-nick" }),
    );
    const outgoing = await listRequests(fakeClient(store), {
      accountId: "acc-a",
      profileId: "p-a",
      direction: "outgoing",
    });
    expect(outgoing[0].nickname).toBe("enc:v1:my-nick");
    const incoming = await listRequests(fakeClient(store), {
      accountId: "acc-b",
      profileId: "p-b",
      direction: "incoming",
    });
    expect(incoming[0].nickname).toBeNull();
  });

  it("surfaces awaiting-parent friendships to the right parent", async () => {
    const store = setup([
      profile({ id: "p-a", account_id: "acc-a" }),
      profile({
        id: "p-b",
        account_id: "acc-b",
        social_id: "ben",
        incoming_friend_requests_require_parent_approval: true,
      }),
    ]);
    const created = await createFriendRequest(fakeClient(store), reqInput());
    await respondToRequest(fakeClient(store), {
      accountId: "acc-b",
      profileId: "p-b",
      friendshipId: created.id,
      action: "accept",
      addresseeCard: ADDR_CARD,
    });
    const approvals = await listPendingApprovals(fakeClient(store), "acc-b");
    expect(approvals).toHaveLength(1);
    expect(approvals[0].side).toBe("addressee");
    expect(approvals[0].profileId).toBe("p-b");
    // Incoming approval carries the requester's sealed preview card + sign key
    // so the parent can decrypt the requester's name client-side.
    expect(approvals[0].previewCard).toBe(PREVIEW);
    expect(approvals[0].counterpartSignPublicKey).toBe("sign-x");
    expect(approvals[0].nickname).toBeNull();
    // The requester's parent has nothing to approve.
    expect(await listPendingApprovals(fakeClient(store), "acc-a")).toHaveLength(0);
  });

  it("re-seals the requester's card so an accepted friend sees the new data", async () => {
    // Reproduces the stale-friend-list bug: a friend keeps seeing the snapshot
    // card until the owner re-seals it. After refresh, the new card is delivered.
    const store = setup([
      profile({ id: "p-a", account_id: "acc-a", friend_kem_public_key: "kem-a" }),
      profile({ id: "p-b", account_id: "acc-b", friend_kem_public_key: "kem-b" }),
    ]);
    const created = await createFriendRequest(fakeClient(store), reqInput());
    await respondToRequest(fakeClient(store), {
      accountId: "acc-b",
      profileId: "p-b",
      friendshipId: created.id,
      action: "accept",
      addresseeCard: ADDR_CARD,
    });

    // p-a (requester) edits its avatar/name → re-seals to every friend.
    const targets = await listCardRefreshTargets(fakeClient(store), {
      accountId: "acc-a",
      profileId: "p-a",
    });
    expect(targets).toEqual([
      { friendshipId: created.id, side: "requester", counterpartKemPublicKey: "kem-b" },
    ]);

    const NEW_PREVIEW = JSON.stringify({ preview: "v2" });
    const NEW_FULL = JSON.stringify({ full: "v2" });
    const n = await refreshFriendCards(fakeClient(store), {
      accountId: "acc-a",
      profileId: "p-a",
      cards: [{ friendshipId: created.id, previewCard: NEW_PREVIEW, card: NEW_FULL }],
    });
    expect(n).toBe(1);

    // The addressee's friend list now reads the refreshed card, not the snapshot.
    const friendsOfB = await listFriends(fakeClient(store), {
      accountId: "acc-b",
      profileId: "p-b",
    });
    expect(friendsOfB[0].card).toBe(NEW_FULL);
  });

  it("re-seals the addressee's card so the requester sees the new data", async () => {
    const store = setup([
      profile({ id: "p-a", account_id: "acc-a", friend_kem_public_key: "kem-a" }),
      profile({ id: "p-b", account_id: "acc-b", friend_kem_public_key: "kem-b" }),
    ]);
    const created = await createFriendRequest(fakeClient(store), reqInput());
    await respondToRequest(fakeClient(store), {
      accountId: "acc-b",
      profileId: "p-b",
      friendshipId: created.id,
      action: "accept",
      addresseeCard: ADDR_CARD,
    });

    const targets = await listCardRefreshTargets(fakeClient(store), {
      accountId: "acc-b",
      profileId: "p-b",
    });
    expect(targets[0]).toMatchObject({ side: "addressee", counterpartKemPublicKey: "kem-a" });

    const NEW_ADDR = JSON.stringify({ addressee: "v2" });
    await refreshFriendCards(fakeClient(store), {
      accountId: "acc-b",
      profileId: "p-b",
      cards: [{ friendshipId: created.id, card: NEW_ADDR }],
    });
    const friendsOfA = await listFriends(fakeClient(store), {
      accountId: "acc-a",
      profileId: "p-a",
    });
    expect(friendsOfA[0].card).toBe(NEW_ADDR);
  });

  it("refreshes the preview a pending addressee sees, before acceptance", async () => {
    const store = setup([
      profile({ id: "p-a", account_id: "acc-a", social_id: "ann" }),
      profile({ id: "p-b", account_id: "acc-b", social_id: "ben" }),
    ]);
    const created = await createFriendRequest(fakeClient(store), reqInput());
    const NEW_PREVIEW = JSON.stringify({ preview: "v2" });
    await refreshFriendCards(fakeClient(store), {
      accountId: "acc-a",
      profileId: "p-a",
      cards: [
        { friendshipId: created.id, previewCard: NEW_PREVIEW, card: JSON.stringify({ full: "v2" }) },
      ],
    });
    const incoming = await listRequests(fakeClient(store), {
      accountId: "acc-b",
      profileId: "p-b",
      direction: "incoming",
    });
    expect(incoming[0].card).toBe(NEW_PREVIEW);
  });

  it("has no addressee card to refresh before the kid accepts", async () => {
    const store = setup([
      profile({ id: "p-a", account_id: "acc-a" }),
      profile({ id: "p-b", account_id: "acc-b" }),
    ]);
    const created = await createFriendRequest(fakeClient(store), reqInput());
    expect(
      await listCardRefreshTargets(fakeClient(store), { accountId: "acc-b", profileId: "p-b" }),
    ).toHaveLength(0);
    const n = await refreshFriendCards(fakeClient(store), {
      accountId: "acc-b",
      profileId: "p-b",
      cards: [{ friendshipId: created.id, card: "x" }],
    });
    expect(n).toBe(0);
  });

  it("won't let a non-participant overwrite a card", async () => {
    const store = setup([
      profile({ id: "p-a", account_id: "acc-a" }),
      profile({ id: "p-b", account_id: "acc-b" }),
    ]);
    const created = await createFriendRequest(fakeClient(store), reqInput());
    await respondToRequest(fakeClient(store), {
      accountId: "acc-b",
      profileId: "p-b",
      friendshipId: created.id,
      action: "accept",
      addresseeCard: ADDR_CARD,
    });
    const n = await refreshFriendCards(fakeClient(store), {
      accountId: "acc-evil",
      profileId: "p-evil",
      cards: [{ friendshipId: created.id, previewCard: "x", card: "x" }],
    });
    expect(n).toBe(0);
    const friendsOfB = await listFriends(fakeClient(store), {
      accountId: "acc-b",
      profileId: "p-b",
    });
    expect(friendsOfB[0].card).toBe(FULL); // untouched
  });

  it("gives an outgoing approval the kid's nickname to decrypt", async () => {
    const store = setup([
      profile({
        id: "p-a",
        account_id: "acc-a",
        outgoing_friend_requests_require_parent_approval: true,
      }),
      profile({ id: "p-b", account_id: "acc-b", social_id: "ben" }),
    ]);
    const created = await createFriendRequest(
      fakeClient(store),
      reqInput({ nickname: "enc:v1:tom" }),
    );
    await respondToRequest(fakeClient(store), {
      accountId: "acc-b",
      profileId: "p-b",
      friendshipId: created.id,
      action: "accept",
      addresseeCard: ADDR_CARD,
    });
    const approvals = await listPendingApprovals(fakeClient(store), "acc-a");
    expect(approvals).toHaveLength(1);
    expect(approvals[0].side).toBe("requester");
    expect(approvals[0].nickname).toBe("enc:v1:tom");
    expect(approvals[0].previewCard).toBeNull();
  });
});

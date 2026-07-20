import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import type {
  Database,
  Friendship,
  GameSnapshot,
  Kid,
} from "@dodi/types/database";

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

// ---------------------------------------------------------------------------
// Minimal in-memory fake of the Supabase query builder — supports only the
// chains the snapshots service uses (eq/in/order + maybeSingle/single/insert/
// update/delete + awaiting the builder as a thenable).
// ---------------------------------------------------------------------------

interface Store {
  kids: Kid[];
  friendships: Friendship[];
  game_snapshots: GameSnapshot[];
  /** One-shot errors consumed by subsequent inserts (FIFO), e.g. FK failures. */
  insertErrors?: Array<{ code: string; message: string }>;
}

type TableName = keyof Store;

class FakeBuilder {
  private mode: "select" | "insert" | "update" | "delete" = "select";
  private payload: Record<string, unknown> | null = null;
  private wantsRows = false;
  private eqs: Array<[string, unknown]> = [];
  private neqs: Array<[string, unknown]> = [];
  private ins: Array<[string, unknown[]]> = [];
  private cached: { data: unknown; error: { message: string } | null } | null =
    null;

  constructor(
    private store: Store,
    private table: TableName,
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
  neq(col: string, val: unknown) {
    this.neqs.push([col, val]);
    return this;
  }
  in(col: string, arr: unknown[]) {
    this.ins.push([col, arr]);
    return this;
  }
  order() {
    return this;
  }

  private matches(row: Record<string, unknown>): boolean {
    for (const [c, v] of this.eqs) if (row[c] !== v) return false;
    for (const [c, v] of this.neqs) if (row[c] === v) return false;
    for (const [c, arr] of this.ins) if (!arr.includes(row[c])) return false;
    return true;
  }

  private rows(): Record<string, unknown>[] {
    return this.store[this.table] as unknown as Record<string, unknown>[];
  }

  private run() {
    if (this.cached) return this.cached;
    if (this.mode === "insert") {
      const injected = this.store.insertErrors?.shift();
      if (injected) {
        this.cached = { data: null, error: injected };
        return this.cached;
      }
      const row = {
        id: `id-${this.table}-${this.rows().length + 1}`,
        game_id: null,
        origin: "own",
        sender_kid_id: null,
        friendship_id: null,
        shared_with_kid_id: null,
        payload_bytes: 0,
        viewed_at: null,
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
      this.cached = {
        data: this.rows().filter((r) => this.matches(r)),
        error: null,
      };
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
      return { data: null, error: error ?? { message: "no rows" } };
    }
    return { data: arr[0], error: null };
  }
  then<T>(resolve: (v: { data: unknown; error: unknown }) => T) {
    return Promise.resolve(this.run()).then(resolve);
  }
}

function fakeClient(store: Store): SupabaseClient<Database> {
  return {
    from: (table: TableName) => new FakeBuilder(store, table),
  } as unknown as SupabaseClient<Database>;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function kid(overrides: Partial<Kid>): Kid {
  return {
    id: "k-x",
    account_id: "acc-x",
    display_name: "enc:v1:name",
    social_id: "handle-x",
    birthdate: null,
    avatar_config: null,
    avatar_pin: null,
    active_persona: null,
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
  } as Kid;
}

function friendship(overrides: Partial<Friendship>): Friendship {
  return {
    id: "f-1",
    requester_account_id: "acc-a",
    requester_kid_id: "kid-a",
    addressee_account_id: "acc-b",
    addressee_kid_id: "kid-b",
    status: "accepted",
    addressee_accepted: true,
    requester_parent_ok: null,
    addressee_parent_ok: null,
    blocked_by: null,
    requester_preview_card: null,
    requester_card: null,
    addressee_card: null,
    nickname: null,
    created_at: "t0",
    updated_at: "t0",
    ...overrides,
  } as Friendship;
}

function snapshotRow(overrides: Partial<GameSnapshot>): GameSnapshot {
  return {
    id: "s-1",
    account_id: "acc-a",
    kid_id: "kid-a",
    game_id: null,
    origin: "own",
    sender_kid_id: null,
    friendship_id: null,
    shared_with_kid_id: null,
    info_enc: "enc:v1:info",
    payload_enc: "enc:v1:payload",
    payload_bytes: 100,
    viewed_at: null,
    created_at: "t0",
    updated_at: "t0",
    ...overrides,
  } as GameSnapshot;
}

const KID_A = kid({ id: "kid-a", account_id: "acc-a", friend_sign_public_key: "sign-a" });
const KID_B = kid({ id: "kid-b", account_id: "acc-b", friend_sign_public_key: "sign-b" });

function setup(overrides: Partial<Store> = {}): Store {
  return {
    kids: [KID_A, KID_B],
    friendships: [friendship({})],
    game_snapshots: [],
    ...overrides,
  };
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
    const store = setup();
    const result = await shareSnapshot(fakeClient(store), {
      senderAccountId: "acc-a",
      senderKidId: "kid-a",
      friendshipId: "f-1",
      gameId: "game-1",
      ...SEALED,
    });
    expect(result.recipientKidId).toBe("kid-b");
    expect(store.game_snapshots).toHaveLength(1);
    const row = store.game_snapshots[0];
    expect(row.account_id).toBe("acc-b");
    expect(row.kid_id).toBe("kid-b");
    expect(row.origin).toBe("received");
    expect(row.sender_kid_id).toBe("kid-a");
    expect(row.friendship_id).toBe("f-1");
    // Soft reference to the SENDER's game — no longer nulled on delivery.
    expect(row.game_id).toBe("game-1");
  });

  it("works from the addressee side too", async () => {
    const store = setup();
    const result = await shareSnapshot(fakeClient(store), {
      senderAccountId: "acc-b",
      senderKidId: "kid-b",
      friendshipId: "f-1",
      gameId: null,
      ...SEALED,
    });
    expect(result.recipientKidId).toBe("kid-a");
    expect(store.game_snapshots[0].account_id).toBe("acc-a");
  });

  it("rejects a friendship that is not accepted", async () => {
    const store = setup({
      friendships: [friendship({ status: "pending", addressee_accepted: false })],
    });
    await expect(
      shareSnapshot(fakeClient(store), {
        senderAccountId: "acc-a",
        senderKidId: "kid-a",
        friendshipId: "f-1",
        gameId: "game-1",
        ...SEALED,
      }),
    ).rejects.toThrow("friendship_not_accepted");
    expect(store.game_snapshots).toHaveLength(0);
  });

  it("rejects a sender kid that is not on the friendship", async () => {
    const store = setup();
    await expect(
      shareSnapshot(fakeClient(store), {
        senderAccountId: "acc-a",
        senderKidId: "kid-intruder",
        friendshipId: "f-1",
        gameId: "game-1",
        ...SEALED,
      }),
    ).rejects.toThrow("not_participant");
  });

  it("rejects a sender kid claimed by the wrong account", async () => {
    const store = setup();
    await expect(
      shareSnapshot(fakeClient(store), {
        senderAccountId: "acc-b", // kid-a belongs to acc-a
        senderKidId: "kid-a",
        friendshipId: "f-1",
        gameId: "game-1",
        ...SEALED,
      }),
    ).rejects.toThrow("not_participant");
  });

  it("rejects an unknown friendship", async () => {
    const store = setup();
    await expect(
      shareSnapshot(fakeClient(store), {
        senderAccountId: "acc-a",
        senderKidId: "kid-a",
        friendshipId: "f-missing",
        gameId: "game-1",
        ...SEALED,
      }),
    ).rejects.toThrow("friendship_not_found");
  });

  it("degrades to a NULL game reference when the sender's game is gone", async () => {
    const store = setup({
      insertErrors: [
        {
          code: "23503",
          message:
            'insert or update on table "game_snapshots" violates foreign key constraint "game_snapshots_game_id_fkey"',
        },
      ],
    });
    const result = await shareSnapshot(fakeClient(store), {
      senderAccountId: "acc-a",
      senderKidId: "kid-a",
      friendshipId: "f-1",
      gameId: "game-deleted",
      ...SEALED,
    });
    expect(result.recipientKidId).toBe("kid-b");
    expect(store.game_snapshots).toHaveLength(1);
    expect(store.game_snapshots[0].game_id).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Autosave slot — one hidden row per (kid, game), overwritten in place
// ---------------------------------------------------------------------------

describe("upsertAutosaveSnapshot / getAutosaveSnapshot", () => {
  it("creates the slot on first save and overwrites it in place afterwards", async () => {
    const store = setup();
    const first = await upsertAutosaveSnapshot(fakeClient(store), {
      accountId: "acc-a",
      kidId: "kid-a",
      gameId: "game-1",
      ...SEALED,
    });
    expect(store.game_snapshots).toHaveLength(1);
    expect(store.game_snapshots[0].origin).toBe("autosave");
    expect(store.game_snapshots[0].game_id).toBe("game-1");

    const second = await upsertAutosaveSnapshot(fakeClient(store), {
      accountId: "acc-a",
      kidId: "kid-a",
      gameId: "game-1",
      infoEnc: "enc:v1:info-2",
      payloadEnc: "enc:v1:payload-2",
      payloadBytes: 999,
    });
    expect(second.id).toBe(first.id);
    expect(store.game_snapshots).toHaveLength(1);
    expect(store.game_snapshots[0].payload_enc).toBe("enc:v1:payload-2");
    expect(store.game_snapshots[0].payload_bytes).toBe(999);
  });

  it("keeps separate slots per game", async () => {
    const store = setup();
    await upsertAutosaveSnapshot(fakeClient(store), {
      accountId: "acc-a",
      kidId: "kid-a",
      gameId: "game-1",
      ...SEALED,
    });
    await upsertAutosaveSnapshot(fakeClient(store), {
      accountId: "acc-a",
      kidId: "kid-a",
      gameId: "game-2",
      ...SEALED,
    });
    expect(store.game_snapshots).toHaveLength(2);
  });

  it("rejects a kid the caller does not own", async () => {
    const store = setup();
    await expect(
      upsertAutosaveSnapshot(fakeClient(store), {
        accountId: "acc-a",
        kidId: "kid-b",
        gameId: "game-1",
        ...SEALED,
      }),
    ).rejects.toThrow("kid_not_found");
  });

  it("getAutosaveSnapshot returns the slot with payload, or null", async () => {
    const store = setup({
      game_snapshots: [
        snapshotRow({
          id: "s-auto",
          origin: "autosave",
          game_id: "game-1",
        }),
      ],
    });
    const found = await getAutosaveSnapshot(fakeClient(store), {
      accountId: "acc-a",
      kidId: "kid-a",
      gameId: "game-1",
    });
    expect(found?.id).toBe("s-auto");
    expect(found?.payloadEnc).toBe("enc:v1:payload");

    const none = await getAutosaveSnapshot(fakeClient(store), {
      accountId: "acc-a",
      kidId: "kid-a",
      gameId: "game-other",
    });
    expect(none).toBeNull();
  });

  it("rejects reading a slot for a kid of another account", async () => {
    const store = setup();
    await expect(
      getAutosaveSnapshot(fakeClient(store), {
        accountId: "acc-a",
        kidId: "kid-b",
        gameId: "game-1",
      }),
    ).rejects.toThrow("kid_not_found");
  });
});

// ---------------------------------------------------------------------------
// Own-snapshot CRUD scoping
// ---------------------------------------------------------------------------

describe("createOwnSnapshot", () => {
  it("stores an own row for the caller's kid", async () => {
    const store = setup();
    const created = await createOwnSnapshot(fakeClient(store), {
      accountId: "acc-a",
      kidId: "kid-a",
      gameId: "game-1",
      ...SEALED,
    });
    expect(created.id).toBeTruthy();
    const row = store.game_snapshots[0];
    expect(row.origin).toBe("own");
    expect(row.account_id).toBe("acc-a");
    expect(row.game_id).toBe("game-1");
  });

  it("rejects a kid the caller does not own", async () => {
    const store = setup();
    await expect(
      createOwnSnapshot(fakeClient(store), {
        accountId: "acc-a",
        kidId: "kid-b",
        gameId: null,
        ...SEALED,
      }),
    ).rejects.toThrow("kid_not_found");
  });

  it("records the sent-to friend kid when the save was created by sharing", async () => {
    const store = setup();
    await createOwnSnapshot(fakeClient(store), {
      accountId: "acc-a",
      kidId: "kid-a",
      gameId: "game-1",
      sharedWithKidId: "kid-b",
      ...SEALED,
    });
    expect(store.game_snapshots[0].shared_with_kid_id).toBe("kid-b");
  });

  it("degrades the sent marker to NULL when the friend kid is gone", async () => {
    const store = setup({
      insertErrors: [
        {
          code: "23503",
          message:
            'insert or update on table "game_snapshots" violates foreign key constraint "game_snapshots_shared_with_kid_id_fkey"',
        },
      ],
    });
    const created = await createOwnSnapshot(fakeClient(store), {
      accountId: "acc-a",
      kidId: "kid-a",
      gameId: "game-1",
      sharedWithKidId: "kid-deleted",
      ...SEALED,
    });
    expect(created.id).toBeTruthy();
    expect(store.game_snapshots).toHaveLength(1);
    expect(store.game_snapshots[0].shared_with_kid_id).toBeNull();
    // The save itself must survive losing the pointer.
    expect(store.game_snapshots[0].game_id).toBe("game-1");
  });
});

describe("listSnapshots / getSnapshot", () => {
  it("lists only the kid's rows (never autosaves) and joins the sender's signing key", async () => {
    const store = setup({
      game_snapshots: [
        snapshotRow({ id: "s-own", kid_id: "kid-a", account_id: "acc-a" }),
        snapshotRow({
          id: "s-received",
          kid_id: "kid-a",
          account_id: "acc-a",
          origin: "received",
          sender_kid_id: "kid-b",
          friendship_id: "f-1",
        }),
        // The hidden resume slot must not surface in the collection.
        snapshotRow({
          id: "s-autosave",
          kid_id: "kid-a",
          account_id: "acc-a",
          origin: "autosave",
          game_id: "game-1",
        }),
        snapshotRow({ id: "s-other", kid_id: "kid-b", account_id: "acc-b" }),
      ],
    });
    const items = await listSnapshots(fakeClient(store), {
      accountId: "acc-a",
      kidId: "kid-a",
    });
    expect(items.map((i) => i.id).sort()).toEqual(["s-own", "s-received"]);
    const received = items.find((i) => i.id === "s-received");
    expect(received?.senderSignPublicKey).toBe("sign-b");
    // Light rows must not carry the heavy payload blob.
    expect("payloadEnc" in (received ?? {})).toBe(false);
  });

  it("surfaces autosave slots only when includeAutosave is set", async () => {
    const store = setup({
      game_snapshots: [
        snapshotRow({ id: "s-own", kid_id: "kid-a", account_id: "acc-a" }),
        snapshotRow({
          id: "s-autosave",
          kid_id: "kid-a",
          account_id: "acc-a",
          origin: "autosave",
          game_id: "game-1",
        }),
      ],
    });
    const items = await listSnapshots(fakeClient(store), {
      accountId: "acc-a",
      kidId: "kid-a",
      includeAutosave: true,
    });
    expect(items.map((i) => i.id).sort()).toEqual(["s-autosave", "s-own"]);
  });

  it("carries the sent marker on list items", async () => {
    const store = setup({
      game_snapshots: [
        snapshotRow({
          id: "s-sent",
          kid_id: "kid-a",
          account_id: "acc-a",
          shared_with_kid_id: "kid-b",
        }),
      ],
    });
    const items = await listSnapshots(fakeClient(store), {
      accountId: "acc-a",
      kidId: "kid-a",
    });
    expect(items[0].sharedWithKidId).toBe("kid-b");
  });

  it("rejects listing for a kid of another account", async () => {
    const store = setup();
    await expect(
      listSnapshots(fakeClient(store), { accountId: "acc-a", kidId: "kid-b" }),
    ).rejects.toThrow("kid_not_found");
  });

  it("getSnapshot returns the payload but hides other accounts' rows", async () => {
    const store = setup({
      game_snapshots: [snapshotRow({ id: "s-1", account_id: "acc-a" })],
    });
    const mine = await getSnapshot(fakeClient(store), {
      accountId: "acc-a",
      id: "s-1",
    });
    expect(mine?.payloadEnc).toBe("enc:v1:payload");
    const theirs = await getSnapshot(fakeClient(store), {
      accountId: "acc-b",
      id: "s-1",
    });
    expect(theirs).toBeNull();
  });
});

describe("markSnapshotViewed / deleteSnapshot", () => {
  it("sets viewed_at once and leaves it stable", async () => {
    const store = setup({
      game_snapshots: [snapshotRow({ id: "s-1", account_id: "acc-a" })],
    });
    await markSnapshotViewed(fakeClient(store), { accountId: "acc-a", id: "s-1" });
    const first = store.game_snapshots[0].viewed_at;
    expect(first).toBeTruthy();
    await markSnapshotViewed(fakeClient(store), { accountId: "acc-a", id: "s-1" });
    expect(store.game_snapshots[0].viewed_at).toBe(first);
  });

  it("deletes only rows the caller owns", async () => {
    const store = setup({
      game_snapshots: [snapshotRow({ id: "s-1", account_id: "acc-a" })],
    });
    await expect(
      deleteSnapshot(fakeClient(store), { accountId: "acc-b", id: "s-1" }),
    ).rejects.toThrow("snapshot_not_found");
    await deleteSnapshot(fakeClient(store), { accountId: "acc-a", id: "s-1" });
    expect(store.game_snapshots).toHaveLength(0);
  });
});

import { describe, expect, it, vi } from "vitest";

import type { SealedEnvelope } from "@dodi/protocol/envelope";
import {
  generateKidFriendKeys,
  openFriendCard,
  publishedFriendKeys,
  sealFriendCard,
  wrapKidSecretKeys,
} from "@dodi/protocol/friend-card";
import type { FriendCard, Kid } from "@dodi/types/database";
import { VaultSession } from "@dodi/vault";

import {
  type DecodedFriend,
  type FriendshipView,
  FriendsError,
  acceptRequest,
  decodeView,
  friendDisplayParts,
  friendErrorKey,
  friendMatchesQuery,
  friendShareUrl,
  keysForKid,
  loadFriendBuckets,
  normalizeHandle,
  parseScannedCode,
  resolveFriendName,
  sendFriendRequest,
} from "./friends";
import type { PlatformApi } from "./platform";

type Handler = (init: RequestInit | undefined) => Response;

/** Routes by path (query included); records every call. */
function api(routes: Record<string, Handler>) {
  const calls: Array<{ path: string; body: unknown }> = [];
  const request = vi.fn(async (path: string, init?: RequestInit) => {
    calls.push({ path, body: init?.body ? JSON.parse(init.body as string) : undefined });
    const handler = routes[path];
    if (!handler) throw new Error(`unrouted ${path}`);
    return handler(init);
  });
  return { api: { request } as unknown as PlatformApi, calls };
}

const json =
  (body: unknown, status = 200): Handler =>
  () =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const session = new VaultSession(new Uint8Array(32).fill(5));

function view(extra: Partial<FriendshipView>): FriendshipView {
  return {
    id: "f1",
    status: "accepted",
    role: "requester",
    counterpartKidId: "other",
    counterpartSocialId: "ZOE12345",
    counterpartSignPublicKey: null,
    counterpartKemPublicKey: null,
    card: null,
    cardKind: null,
    nickname: null,
    myParentPending: false,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-02-01T00:00:00Z",
    ...extra,
  };
}

function friend(extra: Partial<DecodedFriend>): DecodedFriend {
  return { ...decodeView(view({}), generateKidFriendKeys()), ...extra };
}

describe("handles + QR codes", () => {
  it("normalizes typed codes", () => {
    expect(normalizeHandle("  @@abc123 ")).toBe("ABC123");
  });

  it("reads the code from a deep link, else takes the bare value", () => {
    expect(parseScannedCode("https://app.dodi.app/friends?add=abc%2D12")).toBe("ABC-12");
    expect(parseScannedCode("https://app.dodi.app/friends?x=1&add=zz9#top")).toBe("ZZ9");
    expect(parseScannedCode(" mia77 ")).toBe("MIA77");
    expect(parseScannedCode("https://app.dodi.app/friends")).toBe("HTTPS://APP.DODI.APP/FRIENDS");
  });

  it("builds the deep link a QR shows, only once origin and code are known", () => {
    expect(friendShareUrl("https://app.dodi.app", "AB C")).toBe("https://app.dodi.app/friends?add=AB%20C");
    expect(friendShareUrl("", "ABC")).toBe("");
    expect(friendShareUrl("https://x", null)).toBe("");
    expect(parseScannedCode(friendShareUrl("https://app.dodi.app", "MIA77"))).toBe("MIA77");
  });
});

describe("decodeView", () => {
  it("opens the sealed card and the kid's own sealed nickname", () => {
    const mine = generateKidFriendKeys();
    const theirs = generateKidFriendKeys();
    const card: FriendCard = { displayName: "Zoe", avatarConfig: { color: 2, avatar: "animal_fox" }, birthdate: "2018-05-01" };
    const sealed = JSON.stringify(sealFriendCard(publishedFriendKeys(mine).kemPublicKey, card, theirs.sign));
    const decoded = decodeView(
      view({ card: sealed, nickname: session.encryptField("Zo from school") }),
      mine,
      session,
    );
    expect(decoded).toMatchObject({
      name: "Zoe",
      birthdate: "2018-05-01",
      avatarConfig: { color: 2, avatar: "animal_fox" },
      nickname: "Zo from school",
      handle: "ZOE12345",
    });
  });

  it("falls back to the handle when the card is for another kid", () => {
    const other = generateKidFriendKeys();
    const sealed = JSON.stringify(sealFriendCard(publishedFriendKeys(other).kemPublicKey, { displayName: "X", avatarConfig: null }, other.sign));
    expect(decodeView(view({ card: sealed }), generateKidFriendKeys(), session).name).toBeNull();
  });

  it("never reuses another kid's cached keys", () => {
    const keys = generateKidFriendKeys();
    expect(keysForKid({ kidId: "a", keys }, "a")).toBe(keys);
    expect(keysForKid({ kidId: "a", keys }, "b")).toBeNull();
    expect(keysForKid(null, "a")).toBeNull();
  });
});

describe("sendFriendRequest", () => {
  const myKeys = generateKidFriendKeys();
  const me = {
    id: "k1",
    social_id: "MIA77",
    display_name: "Mia",
    avatar_config: { color: 1, avatar: "animal_cat" },
    birthdate: "2017-03-02",
    friend_secret_keys: wrapKidSecretKeys(session, myKeys),
  } as unknown as Kid;

  it("seals the preview + full cards to the target and the nickname under the vault", async () => {
    const target = generateKidFriendKeys();
    const { api: a, calls } = api({
      "/api/friends/lookup": json({
        kidId: "t1",
        kemPublicKey: publishedFriendKeys(target).kemPublicKey,
        signPublicKey: publishedFriendKeys(target).signPublicKey,
      }),
      "/api/friends/request": json({}),
      "/api/activities": json({}),
    });
    await sendFriendRequest(a, me, session, " @zoe1 ", " Zo ");

    expect(calls[0]).toEqual({ path: "/api/friends/lookup", body: { socialId: "ZOE1" } });
    const body = calls[1].body as Record<string, string>;
    expect(calls[1].path).toBe("/api/friends/request");
    expect(body.requesterKidId).toBe("k1");
    expect(body.targetKidId).toBe("t1");
    expect(session.decryptField(body.nickname)).toBe("Zo");
    const full = openFriendCard<FriendCard>(
      target.kem.secretKey,
      JSON.parse(body.fullCard) as SealedEnvelope,
      publishedFriendKeys(myKeys).signPublicKey,
    );
    expect(full).toEqual({ displayName: "Mia", avatarConfig: { color: 1, avatar: "animal_cat" }, birthdate: "2017-03-02" });
    const preview = openFriendCard(target.kem.secretKey, JSON.parse(body.previewCard) as SealedEnvelope);
    expect(preview).toEqual({ displayName: "Mia", avatarConfig: { color: 1, avatar: "animal_cat" } });
    await vi.waitFor(() => expect(calls.some((c) => c.path === "/api/activities")).toBe(true));
  });

  it("refuses your own code before any request", async () => {
    const { api: a, calls } = api({});
    await expect(sendFriendRequest(a, me, session, "mia77", "me")).rejects.toEqual(new FriendsError("cannot_add_self"));
    expect(calls).toEqual([]);
  });

  it("accepting seals my full card to the requester", async () => {
    const requester = generateKidFriendKeys();
    const { api: a, calls } = api({ "/api/friends/f9/respond": json({}), "/api/activities": json({}) });
    await acceptRequest(a, "f9", publishedFriendKeys(requester).kemPublicKey, me, myKeys);
    const body = calls[0].body as { kidId: string; action: string; addresseeCard: string };
    expect(body.action).toBe("accept");
    expect(
      openFriendCard<FriendCard>(requester.kem.secretKey, JSON.parse(body.addresseeCard) as SealedEnvelope).displayName,
    ).toBe("Mia");
    await expect(acceptRequest(a, "f9", null, me, myKeys)).rejects.toBeInstanceOf(FriendsError);
  });
});

describe("loadFriendBuckets", () => {
  it("generates + publishes keys on first use and loads all four lists", async () => {
    const fresh = { id: "k2", social_id: "NEW1", friend_secret_keys: null } as unknown as Kid;
    const { api: a, calls } = api({
      "/api/kids/k2/friend-keys": json({}),
      "/api/friends?kidId=k2": json([view({ id: "a1" })]),
      "/api/friends/requests?kidId=k2&direction=incoming": json([view({ id: "i1", status: "pending", role: "addressee" })]),
      "/api/friends/requests?kidId=k2&direction=outgoing": json([]),
      "/api/friends/blocked?kidId=k2": json([]),
    });
    const loaded = await loadFriendBuckets(a, fresh, session, null);
    expect(loaded.hasPublishedKeys).toBe(true);
    expect(loaded.keys.kidId).toBe("k2");
    expect(loaded.buckets.friends.map((f) => f.id)).toEqual(["a1"]);
    expect(loaded.buckets.incoming.map((f) => f.id)).toEqual(["i1"]);
    expect(calls[0].path).toBe("/api/kids/k2/friend-keys");

    // Cached keys for this kid: no publish, no new keys.
    const again = await loadFriendBuckets(a, fresh, session, loaded.keys);
    expect(again.hasPublishedKeys).toBe(false);
    expect(again.keys.keys).toBe(loaded.keys.keys);
  });
});

describe("presentation helpers", () => {
  it("names a friend: real name first, nickname in brackets, else the nickname", () => {
    expect(friendDisplayParts({ name: "Zoe", nickname: "Zo" })).toEqual({ primary: "Zoe", suffix: "Zo" });
    expect(friendDisplayParts({ name: null, nickname: " Zo " })).toEqual({ primary: "Zo", suffix: null });
    expect(friendDisplayParts({ name: null, nickname: null })).toEqual({ primary: "—", suffix: null });
  });

  it("searches name and nickname", () => {
    expect(friendMatchesQuery({ name: "Zoe", nickname: "school" }, "sch")).toBe(true);
    expect(friendMatchesQuery({ name: "Zoe", nickname: null }, "leo")).toBe(false);
    expect(friendMatchesQuery({ name: null, nickname: null }, "")).toBe(true);
  });

  it("resolves the best-known name for a handle across all lists", () => {
    const buckets = {
      friends: [],
      incoming: [],
      outgoing: [friend({ handle: "ZOE1", name: null, nickname: "Zo" })],
      blocked: [],
    };
    expect(resolveFriendName(buckets, "zoe1")).toBe("Zo");
    expect(resolveFriendName(buckets, "nobody")).toBeNull();
  });

  it("maps request failures to message keys", () => {
    expect(friendErrorKey(new FriendsError("x", 404))).toBe("errorNotFound");
    expect(friendErrorKey(new FriendsError("already_friends", 409))).toBe("errorAlreadyFriends");
    expect(friendErrorKey(new FriendsError("cannot_add_self"))).toBe("errorSelf");
    expect(friendErrorKey(new FriendsError("target_unavailable", 400))).toBe("errorNotFound");
    expect(friendErrorKey(new FriendsError("weird", 500))).toBe("errorGeneric");
    expect(friendErrorKey(new Error("locked"))).toBe("errorVaultLocked");
    expect(friendErrorKey("nope")).toBe("errorGeneric");
  });
});

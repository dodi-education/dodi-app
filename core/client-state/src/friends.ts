/**
 * The kid friends layer, shared by the web and the app: bridges the platform
 * API with the E2EE friend-card crypto. The server is blind: names, avatars
 * and birthdates travel as `SealedEnvelope` blobs only the recipient kid's
 * kid key can open, so all sealing and opening happens on the device.
 *
 * Friend cards are point-in-time snapshots: editing a shared field (name,
 * avatar, birthdate) must re-seal the card to every friend
 * ({@link refreshFriendCards}).
 */
import type { SealedEnvelope } from "@dodi/protocol/envelope";
import { type KidFriendKeys, openFriendCard, sealFriendCard } from "@dodi/protocol/friend-card";
import type { FriendCard, Json, Kid } from "@dodi/types/database";
import type { VaultSession } from "@dodi/vault";

import {
  FriendsError,
  buildFriendCards,
  ensureFriendKeys,
  friendsRequest,
} from "./friend-cards";
import { logKidActivity } from "./kid-activity";
import type { PlatformApi } from "./platform";

// The card + key layer (also used by the parent's kid pages) lives in
// friend-cards; parent approvals in friend-approvals.
export {
  type CardRefreshTarget,
  FriendsError,
  buildFriendCards,
  ensureFriendKeys,
  fetchCardRefreshTargets,
  friendsRequest,
  refreshFriendCards,
} from "./friend-cards";
export { formatHandle } from "./friend-approvals";

export type FriendshipStatus = "pending" | "awaiting_parent" | "accepted" | "rejected" | "blocked";

/** Raw friendship view as returned by the platform API. */
export interface FriendshipView {
  id: string;
  status: FriendshipStatus;
  role: "requester" | "addressee";
  counterpartKidId: string;
  counterpartSocialId: string | null;
  counterpartSignPublicKey: string | null;
  counterpartKemPublicKey: string | null;
  card: string | null;
  cardKind: "preview" | "full" | null;
  nickname: string | null;
  myParentPending: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FriendTarget {
  kidId: string;
  kemPublicKey: string;
  signPublicKey: string;
}

/** A friendship decoded for rendering: the counterpart's identity opened from the sealed card. */
export interface DecodedFriend {
  id: string;
  status: FriendshipStatus;
  role: "requester" | "addressee";
  /** Counterpart's public friend code (displayed as-is, no prefix). */
  handle: string | null;
  /** Counterpart's name, once a card has been delivered. */
  name: string | null;
  /** The requester's own private nickname for this friend (always set on requests they sent). */
  nickname: string | null;
  /** Counterpart's birthdate, once the full card has been delivered (accepted). */
  birthdate: string | null;
  avatarConfig: Json | null;
  counterpartKemPublicKey: string | null;
  /** While awaiting_parent: is this kid's own parent still the one to approve? */
  myParentPending: boolean;
  createdAt: string;
  updatedAt: string;
}


// ---------------------------------------------------------------------------
// Handles
// ---------------------------------------------------------------------------

/**
 * Normalize a typed/pasted friend code to a bare social_id. Codes are canonically
 * UPPERCASE (see `generateSocialId`), so we uppercase here to make lookups
 * case-insensitive for the kid. A stray leading `@` (older-style code) is dropped.
 */
export function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@+/, "").toUpperCase();
}

/** The `add` query value of a URL-shaped string, or null (no URL parsing: Hermes' URL lacks searchParams). */
function addParamOf(value: string): string | null {
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;
  const query = value.split("#")[0].split("?")[1];
  if (!query) return null;
  for (const pair of query.split("&")) {
    const [key, raw = ""] = pair.split("=");
    if (key !== "add") continue;
    try {
      return decodeURIComponent(raw.replace(/\+/g, " "));
    } catch {
      return raw;
    }
  }
  return null;
}

/**
 * Extract a friend code from a scanned QR value. dodi codes encode a deep link
 * (`…/friends?add=<code>`); a bare handle also works so a hand-typed or
 * third-party code still does. Returns "" if there's nothing usable.
 */
export function parseScannedCode(value: string): string {
  const raw = value.trim();
  const add = addParamOf(raw);
  if (add) return normalizeHandle(add);
  return normalizeHandle(raw);
}

/** The deep link a kid's QR code encodes (`{origin}/friends?add=<code>`); "" until both are known. */
export function friendShareUrl(origin: string, socialId: string | null): string {
  return socialId && origin ? `${origin}/friends?add=${encodeURIComponent(socialId)}` : "";
}

/** A typed friend code is long enough to send. */
export const MIN_HANDLE_LENGTH = 3;

// ---------------------------------------------------------------------------
// Keys + cards
// ---------------------------------------------------------------------------

/** Open the sealed card the server delivered to me, plus my own private label. */
export function decodeView(
  view: FriendshipView,
  myKeys: KidFriendKeys,
  session?: VaultSession,
): DecodedFriend {
  let name: string | null = null;
  let birthdate: string | null = null;
  let avatarConfig: Json | null = null;
  if (view.card) {
    try {
      const envelope = JSON.parse(view.card) as SealedEnvelope;
      const card = openFriendCard<FriendCard>(
        myKeys.kem.secretKey,
        envelope,
        view.counterpartSignPublicKey ?? undefined,
      );
      name = card.displayName ?? null;
      birthdate = card.birthdate ?? null;
      avatarConfig = card.avatarConfig ?? null;
    } catch {
      // Couldn't open (key mismatch / tampered): fall back to handle only.
    }
  }
  let nickname: string | null = null;
  if (view.nickname && session) {
    try {
      nickname = session.decryptField(view.nickname);
    } catch {
      // Nickname unreadable: ignore.
    }
  }
  return {
    id: view.id,
    status: view.status,
    role: view.role,
    handle: view.counterpartSocialId,
    name,
    nickname,
    birthdate,
    avatarConfig,
    counterpartKemPublicKey: view.counterpartKemPublicKey,
    myParentPending: view.myParentPending,
    createdAt: view.createdAt,
    updatedAt: view.updatedAt,
  };
}

/** Friend keys remembered for one specific kid. */
export interface CachedFriendKeys {
  kidId: string;
  keys: KidFriendKeys;
}

/**
 * Return the cached keys only when they belong to `kidId`. Switching the
 * active kid must never reuse the previous kid's keys: their sealed cards
 * would silently fail to open (names render as "—" until a full reload).
 */
export function keysForKid(cache: CachedFriendKeys | null, kidId: string): KidFriendKeys | null {
  return cache && cache.kidId === kidId ? cache.keys : null;
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

export function lookupTarget(api: PlatformApi, socialId: string): Promise<FriendTarget> {
  return friendsRequest<FriendTarget>(api, "/api/friends/lookup", {
    method: "POST",
    body: JSON.stringify({ socialId }),
  });
}

/** Look up a friend by code, seal both cards to them, and send the request. */
export async function sendFriendRequest(
  api: PlatformApi,
  kid: Kid,
  session: VaultSession,
  rawHandle: string,
  nickname: string,
): Promise<void> {
  const socialId = normalizeHandle(rawHandle);
  // Catch self-adds here: lookup only returns discoverable kids, so your own
  // code would otherwise come back as "not found" before the server's self-check.
  if (socialId === normalizeHandle(kid.social_id)) {
    throw new FriendsError("cannot_add_self");
  }
  const keys = await ensureFriendKeys(api, kid, session);
  const target = await lookupTarget(api, socialId);
  const { preview, full } = buildFriendCards(kid);
  const previewCard = JSON.stringify(sealFriendCard(target.kemPublicKey, preview, keys.sign));
  const fullCard = JSON.stringify(sealFriendCard(target.kemPublicKey, full, keys.sign));
  // The nickname is the requester's own: sealed under their VMK, never shared.
  await friendsRequest(api, "/api/friends/request", {
    method: "POST",
    body: JSON.stringify({
      requesterKidId: kid.id,
      targetKidId: target.kidId,
      previewCard,
      fullCard,
      nickname: session.encryptField(nickname.trim()),
    }),
  });
  logKidActivity(api, {
    kidId: kid.id,
    event: "friend_request_sent",
    message: "Friend request sent",
  });
}

export function fetchFriends(api: PlatformApi, kidId: string): Promise<FriendshipView[]> {
  return friendsRequest<FriendshipView[]>(api, `/api/friends?kidId=${encodeURIComponent(kidId)}`);
}

export function fetchRequests(
  api: PlatformApi,
  kidId: string,
  direction: "incoming" | "outgoing",
): Promise<FriendshipView[]> {
  return friendsRequest<FriendshipView[]>(api,
    `/api/friends/requests?kidId=${encodeURIComponent(kidId)}&direction=${direction}`,
  );
}

export function fetchBlocked(api: PlatformApi, kidId: string): Promise<FriendshipView[]> {
  return friendsRequest<FriendshipView[]>(api, `/api/friends/blocked?kidId=${encodeURIComponent(kidId)}`);
}

/** Accept an incoming request: seal my card to the requester and confirm. */
export async function acceptRequest(
  api: PlatformApi,
  friendshipId: string,
  counterpartKemPublicKey: string | null,
  kid: Kid,
  myKeys: KidFriendKeys,
): Promise<void> {
  if (!counterpartKemPublicKey) {
    throw new FriendsError("Missing the other kid's key");
  }
  const { full } = buildFriendCards(kid);
  const addresseeCard = JSON.stringify(sealFriendCard(counterpartKemPublicKey, full, myKeys.sign));
  await friendsRequest(api, `/api/friends/${friendshipId}/respond`, {
    method: "POST",
    body: JSON.stringify({ kidId: kid.id, action: "accept", addresseeCard }),
  });
  logKidActivity(api, {
    kidId: kid.id,
    event: "friend_request_accepted",
    message: "Friend request accepted",
  });
}

export function rejectRequest(api: PlatformApi, friendshipId: string, kidId: string): Promise<void> {
  return friendsRequest(api, `/api/friends/${friendshipId}/respond`, {
    method: "POST",
    body: JSON.stringify({ kidId, action: "reject" }),
  });
}

export function removeFriend(api: PlatformApi, friendshipId: string, kidId: string): Promise<void> {
  return friendsRequest(api, `/api/friends/${friendshipId}/remove`, {
    method: "POST",
    body: JSON.stringify({ kidId }),
  });
}

export function blockFriend(api: PlatformApi, friendshipId: string, kidId: string): Promise<void> {
  return friendsRequest(api, `/api/friends/${friendshipId}/block`, {
    method: "POST",
    body: JSON.stringify({ kidId }),
  });
}

export function unblockFriend(api: PlatformApi, friendshipId: string, kidId: string): Promise<void> {
  return friendsRequest(api, `/api/friends/${friendshipId}/unblock`, {
    method: "POST",
    body: JSON.stringify({ kidId }),
  });
}

// ---------------------------------------------------------------------------
// Loading a kid's friends (the friends screen)
// ---------------------------------------------------------------------------

export interface FriendBuckets {
  friends: DecodedFriend[];
  incoming: DecodedFriend[];
  outgoing: DecodedFriend[];
  blocked: DecodedFriend[];
}

export const EMPTY_FRIEND_BUCKETS: FriendBuckets = { friends: [], incoming: [], outgoing: [], blocked: [] };

export interface LoadedFriends {
  buckets: FriendBuckets;
  /** The kid's keys, to cache for the next load / accept. */
  keys: CachedFriendKeys;
  /** Keys were generated + published just now: refresh the kid cache so the public key shows. */
  hasPublishedKeys: boolean;
}

/**
 * Load and decrypt a kid's friends, requests and blocked list. Friend keys
 * come from `cache` when they belong to this kid, else are unwrapped (or
 * generated + published on first use).
 */
export async function loadFriendBuckets(
  api: PlatformApi,
  kid: Kid,
  session: VaultSession,
  cache: CachedFriendKeys | null,
): Promise<LoadedFriends> {
  const cached = keysForKid(cache, kid.id);
  const hadKeys = kid.friend_secret_keys != null || cached != null;
  const keys = cached ?? (await ensureFriendKeys(api, kid, session));
  const [friendsV, incomingV, outgoingV, blockedV] = await Promise.all([
    fetchFriends(api, kid.id),
    fetchRequests(api, kid.id, "incoming"),
    fetchRequests(api, kid.id, "outgoing"),
    fetchBlocked(api, kid.id),
  ]);
  return {
    buckets: {
      friends: friendsV.map((v) => decodeView(v, keys, session)),
      incoming: incomingV.map((v) => decodeView(v, keys, session)),
      outgoing: outgoingV.map((v) => decodeView(v, keys, session)),
      blocked: blockedV.map((v) => decodeView(v, keys, session)),
    },
    keys: { kidId: kid.id, keys },
    hasPublishedKeys: !hadKeys,
  };
}

// ---------------------------------------------------------------------------
// Presentation helpers (pure; both clients render with them)
// ---------------------------------------------------------------------------

/**
 * The real name wins; the requester's private nickname stands in for an
 * outgoing request until the friend accepts, and once both are known it's
 * shown muted in brackets after the name. The friend code is never displayed.
 */
export function friendDisplayParts(friend: Pick<DecodedFriend, "name" | "nickname">): {
  primary: string;
  suffix: string | null;
} {
  const name = friend.name?.trim();
  const nick = friend.nickname?.trim();
  return { primary: name || nick || "—", suffix: name && nick ? nick : null };
}

/** Whether a friend matches the list's search (name or nickname, lowercased query). */
export function friendMatchesQuery(friend: Pick<DecodedFriend, "name" | "nickname">, q: string): boolean {
  if (!q) return true;
  return `${friend.name ?? ""} ${friend.nickname ?? ""}`.toLowerCase().includes(q);
}

/**
 * Best-known display name for an existing relationship with a handle, so the
 * "already friends / request exists" errors name the right kid.
 */
export function resolveFriendName(buckets: FriendBuckets, handle: string): string | null {
  const match = [...buckets.friends, ...buckets.incoming, ...buckets.outgoing, ...buckets.blocked].find(
    (x) => (x.handle ?? "").toLowerCase() === handle.toLowerCase(),
  );
  return match ? match.name?.trim() || match.nickname?.trim() || null : null;
}

/** `friends.*` message keys for a failed friend request. */
export type FriendErrorKey =
  | "errorNotFound"
  | "errorAlreadyFriends"
  | "errorRequestExists"
  | "errorBlocked"
  | "errorNotAllowed"
  | "errorSelf"
  | "errorGeneric"
  | "errorVaultLocked";

/** Map a send-request failure (server code, 404, locked vault) to its kid-friendly message key. */
export function friendErrorKey(e: unknown): FriendErrorKey {
  if (e instanceof FriendsError) {
    if (e.status === 404) return "errorNotFound";
    switch (e.message) {
      case "already_friends":
        return "errorAlreadyFriends";
      case "request_exists":
        return "errorRequestExists";
      case "friendship_blocked":
        return "errorBlocked";
      case "cannot_initiate":
        return "errorNotAllowed";
      case "cannot_add_self":
        return "errorSelf";
      case "target_unavailable":
        return "errorNotFound";
      default:
        return "errorGeneric";
    }
  }
  if (e instanceof Error && e.message === "locked") return "errorVaultLocked";
  return "errorGeneric";
}

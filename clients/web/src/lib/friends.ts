/**
 * Client-side friends layer: bridges the platform API with the E2EE friend-card
 * crypto. The server is blind — names/birthdates travel as `SealedEnvelope`
 * blobs that only the recipient kid's profile key can open, so all sealing and
 * opening happens here in the browser.
 */
import {
  type ProfileFriendKeys,
  type SealedEnvelope,
  generateProfileFriendKeys,
  openFriendCard,
  publishedFriendKeys,
  sealFriendCard,
  unwrapProfileSecretKeys,
  wrapProfileSecretKeys,
} from "@dodi/protocol";
import type {
  FriendCard,
  FriendPreviewCard,
  Json,
  Profile,
} from "@dodi/types/database";
import type { VaultSession } from "@dodi/vault";

import { dodi } from "@/lib/api";

export type FriendshipStatus =
  | "pending"
  | "awaiting_parent"
  | "accepted"
  | "rejected"
  | "blocked";

/** Raw friendship view as returned by the platform API. */
export interface FriendshipView {
  id: string;
  status: FriendshipStatus;
  role: "requester" | "addressee";
  counterpartProfileId: string;
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
  profileId: string;
  kemPublicKey: string;
  signPublicKey: string;
}

export interface PendingApproval {
  friendshipId: string;
  side: "requester" | "addressee";
  profileId: string;
  counterpartProfileId: string;
  counterpartSocialId: string | null;
  counterpartSignPublicKey: string | null;
  /** Requester's nickname ciphertext — set for outgoing (requester-side) approvals. */
  nickname: string | null;
  /** Requester's sealed preview card — set for incoming (addressee-side) approvals. */
  previewCard: string | null;
  createdAt: string;
}

/** A friendship decoded for rendering — the counterpart's identity opened from the sealed card. */
export interface DecodedFriend {
  id: string;
  status: FriendshipStatus;
  role: "requester" | "addressee";
  /** Counterpart's public friend code (displayed as-is — no prefix). */
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

export class FriendsError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "FriendsError";
  }
}

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await dodi.request(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let message = "Request failed";
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // non-JSON error body
    }
    throw new FriendsError(message, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Handles
// ---------------------------------------------------------------------------

/**
 * Normalize a typed/pasted friend code to a bare social_id. Codes are shown and
 * shared without any prefix, but we still tolerate a stray leading `@` in case
 * someone pastes an older-style code.
 */
export function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

/** Null-safe display of a social_id (the bare friend code, no prefix). */
export function formatHandle(socialId: string | null | undefined): string {
  return socialId ?? "";
}

/**
 * Extract a friend code from a scanned QR value. Dodi codes encode a deep link
 * (`…/friends?add=<code>`); we also accept a bare handle so a hand-typed or
 * third-party code still works. Returns "" if there's nothing usable.
 */
export function parseScannedCode(value: string): string {
  const raw = value.trim();
  try {
    const add = new URL(raw).searchParams.get("add");
    if (add) return normalizeHandle(add);
  } catch {
    // Not a URL — treat the whole value as a handle.
  }
  return normalizeHandle(raw);
}

// ---------------------------------------------------------------------------
// Keys + cards
// ---------------------------------------------------------------------------

/** Ensure the active profile has friend keys; generate + publish on first use. */
export async function ensureFriendKeys(
  profile: Profile,
  session: VaultSession,
): Promise<ProfileFriendKeys> {
  if (profile.friend_secret_keys) {
    return unwrapProfileSecretKeys(session, profile.friend_secret_keys);
  }
  const keys = generateProfileFriendKeys();
  const published = publishedFriendKeys(keys);
  const sealedSecretKeys = wrapProfileSecretKeys(session, keys);
  await jsonRequest(`/api/profiles/${profile.id}/friend-keys`, {
    method: "POST",
    body: JSON.stringify({
      kemPublicKey: published.kemPublicKey,
      signPublicKey: published.signPublicKey,
      sealedSecretKeys,
    }),
  });
  return keys;
}

function buildCards(profile: Profile): {
  preview: FriendPreviewCard;
  full: FriendCard;
} {
  const preview: FriendPreviewCard = {
    displayName: profile.display_name,
    avatarConfig: profile.avatar_config,
  };
  return { preview, full: { ...preview, birthdate: profile.birthdate } };
}

/** Open the sealed card the server delivered to me, plus my own private label. */
export function decodeView(
  view: FriendshipView,
  myKeys: ProfileFriendKeys,
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
      // Couldn't open (key mismatch / tampered) — fall back to handle only.
    }
  }
  let nickname: string | null = null;
  if (view.nickname && session) {
    try {
      nickname = session.decryptField(view.nickname);
    } catch {
      // Nickname unreadable — ignore.
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

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

export function lookupTarget(socialId: string): Promise<FriendTarget> {
  return jsonRequest<FriendTarget>("/api/friends/lookup", {
    method: "POST",
    body: JSON.stringify({ socialId }),
  });
}

/** Look up a friend by code, seal both cards to them, and send the request. */
export async function sendFriendRequest(
  profile: Profile,
  session: VaultSession,
  rawHandle: string,
  nickname: string,
): Promise<void> {
  const socialId = normalizeHandle(rawHandle);
  // Catch self-adds here: lookup only returns discoverable profiles, so your own
  // code would otherwise come back as "not found" before the server's self-check.
  if (socialId === normalizeHandle(profile.social_id)) {
    throw new FriendsError("cannot_add_self");
  }
  const keys = await ensureFriendKeys(profile, session);
  const target = await lookupTarget(socialId);
  const { preview, full } = buildCards(profile);
  const previewCard = JSON.stringify(
    sealFriendCard(target.kemPublicKey, preview, keys.sign),
  );
  const fullCard = JSON.stringify(
    sealFriendCard(target.kemPublicKey, full, keys.sign),
  );
  // The nickname is the requester's own — sealed under their VMK, never shared.
  await jsonRequest("/api/friends/request", {
    method: "POST",
    body: JSON.stringify({
      requesterProfileId: profile.id,
      targetProfileId: target.profileId,
      previewCard,
      fullCard,
      nickname: session.encryptField(nickname.trim()),
    }),
  });
}

export function fetchFriends(profileId: string): Promise<FriendshipView[]> {
  return jsonRequest<FriendshipView[]>(
    `/api/friends?profileId=${encodeURIComponent(profileId)}`,
  );
}

export function fetchRequests(
  profileId: string,
  direction: "incoming" | "outgoing",
): Promise<FriendshipView[]> {
  return jsonRequest<FriendshipView[]>(
    `/api/friends/requests?profileId=${encodeURIComponent(profileId)}&direction=${direction}`,
  );
}

export function fetchBlocked(profileId: string): Promise<FriendshipView[]> {
  return jsonRequest<FriendshipView[]>(
    `/api/friends/blocked?profileId=${encodeURIComponent(profileId)}`,
  );
}

/** Accept an incoming request: seal my card to the requester and confirm. */
export async function acceptRequest(
  friendshipId: string,
  counterpartKemPublicKey: string | null,
  profile: Profile,
  myKeys: ProfileFriendKeys,
): Promise<void> {
  if (!counterpartKemPublicKey) {
    throw new FriendsError("Missing the other kid's key");
  }
  const { full } = buildCards(profile);
  const addresseeCard = JSON.stringify(
    sealFriendCard(counterpartKemPublicKey, full, myKeys.sign),
  );
  await jsonRequest(`/api/friends/${friendshipId}/respond`, {
    method: "POST",
    body: JSON.stringify({ profileId: profile.id, action: "accept", addresseeCard }),
  });
}

export function rejectRequest(
  friendshipId: string,
  profileId: string,
): Promise<void> {
  return jsonRequest(`/api/friends/${friendshipId}/respond`, {
    method: "POST",
    body: JSON.stringify({ profileId, action: "reject" }),
  });
}

export function removeFriend(
  friendshipId: string,
  profileId: string,
): Promise<void> {
  return jsonRequest(`/api/friends/${friendshipId}/remove`, {
    method: "POST",
    body: JSON.stringify({ profileId }),
  });
}

export function blockFriend(
  friendshipId: string,
  profileId: string,
): Promise<void> {
  return jsonRequest(`/api/friends/${friendshipId}/block`, {
    method: "POST",
    body: JSON.stringify({ profileId }),
  });
}

export function unblockFriend(
  friendshipId: string,
  profileId: string,
): Promise<void> {
  return jsonRequest(`/api/friends/${friendshipId}/unblock`, {
    method: "POST",
    body: JSON.stringify({ profileId }),
  });
}

// ---------------------------------------------------------------------------
// Parent approvals
// ---------------------------------------------------------------------------

export function fetchApprovals(): Promise<PendingApproval[]> {
  return jsonRequest<PendingApproval[]>("/api/friends/approvals");
}

export function setApproval(
  friendshipId: string,
  side: "requester" | "addressee",
  approve: boolean,
): Promise<void> {
  return jsonRequest(`/api/friends/${friendshipId}/approve`, {
    method: "POST",
    body: JSON.stringify({ side, approve }),
  });
}

/**
 * Resolve the counterpart's display name for a pending approval, client-side:
 * outgoing rows carry the kid's nickname (sealed under this account's VMK);
 * incoming rows carry the requester's preview card (opened with the kid's friend
 * keys, also under this account's VMK). Returns null if it can't be read, so the
 * caller can fall back to the public handle.
 */
export function readApprovalCounterpart(
  session: VaultSession,
  approval: PendingApproval,
  kidSecretKeys: string | null,
): string | null {
  try {
    if (approval.side === "requester") {
      return approval.nickname ? session.decryptField(approval.nickname) : null;
    }
    if (approval.previewCard && kidSecretKeys) {
      const keys = unwrapProfileSecretKeys(session, kidSecretKeys);
      const envelope = JSON.parse(approval.previewCard) as SealedEnvelope;
      const card = openFriendCard<FriendPreviewCard>(
        keys.kem.secretKey,
        envelope,
        approval.counterpartSignPublicKey ?? undefined,
      );
      return card.displayName?.trim() || null;
    }
  } catch {
    // Unreadable (locked vault / key mismatch) — caller falls back to the handle.
  }
  return null;
}

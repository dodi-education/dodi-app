/**
 * A kid's E2EE friend cards: the kid's friend keys and the sealed name /
 * avatar / birthdate cards its friends read. Cards are point-in-time
 * snapshots, so editing a shared field (name, avatar, birthdate) must re-seal
 * the card to every friend ({@link refreshFriendCards}). The server is blind:
 * cards travel as `SealedEnvelope` blobs only the recipient kid can open.
 */
import {
  type KidFriendKeys,
  generateKidFriendKeys,
  publishedFriendKeys,
  sealFriendCard,
  unwrapKidSecretKeys,
  wrapKidSecretKeys,
} from "@dodi/protocol/friend-card";
import type { FriendCard, FriendPreviewCard, Kid } from "@dodi/types/database";
import type { VaultSession } from "@dodi/vault";

import type { PlatformApi } from "./platform";

export class FriendsError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "FriendsError";
  }
}

/**
 * A JSON request to the friends API. Throws {@link FriendsError} with the
 * server's `error` text (or "Request failed"); resolves undefined on 204.
 */
export async function friendsRequest<T>(
  api: PlatformApi,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await api.request(path, {
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

/** Ensure the kid has friend keys; generate + publish them on first use. */
export async function ensureFriendKeys(
  api: PlatformApi,
  kid: Kid,
  session: VaultSession,
): Promise<KidFriendKeys> {
  if (kid.friend_secret_keys) {
    return unwrapKidSecretKeys(session, kid.friend_secret_keys);
  }
  const keys = generateKidFriendKeys();
  const published = publishedFriendKeys(keys);
  const sealedSecretKeys = wrapKidSecretKeys(session, keys);
  await friendsRequest(api, `/api/kids/${kid.id}/friend-keys`, {
    method: "POST",
    body: JSON.stringify({
      kemPublicKey: published.kemPublicKey,
      signPublicKey: published.signPublicKey,
      sealedSecretKeys,
    }),
  });
  return keys;
}

/** The plaintext cards a DECRYPTED kid shares: the preview and the full card. */
export function buildFriendCards(kid: Kid): { preview: FriendPreviewCard; full: FriendCard } {
  const preview: FriendPreviewCard = {
    displayName: kid.display_name,
    avatarConfig: kid.avatar_config,
  };
  return { preview, full: { ...preview, birthdate: kid.birthdate } };
}

/** A friendship whose card this kid seals, plus the key to re-seal it. */
export interface CardRefreshTarget {
  friendshipId: string;
  side: "requester" | "addressee";
  counterpartKemPublicKey: string | null;
}

export function fetchCardRefreshTargets(
  api: PlatformApi,
  kidId: string,
): Promise<CardRefreshTarget[]> {
  return friendsRequest<CardRefreshTarget[]>(
    api,
    `/api/friends/card-targets?kidId=${encodeURIComponent(kidId)}`,
  );
}

/**
 * Re-seal this kid's shared card (name / avatar / birthdate) to every friend
 * so their lists always show current data. Call after editing any shared field.
 * No-op when the kid has no friendships, so it never forces friend-key
 * creation. Requires a DECRYPTED kid (display_name/avatar_config/birthdate).
 */
export async function refreshFriendCards(
  api: PlatformApi,
  kid: Kid,
  session: VaultSession,
): Promise<void> {
  const targets = await fetchCardRefreshTargets(api, kid.id);
  if (targets.length === 0) return;
  const keys = await ensureFriendKeys(api, kid, session);
  const { preview, full } = buildFriendCards(kid);
  const cards = targets
    .filter((t) => t.counterpartKemPublicKey)
    .map((t) => {
      const kem = t.counterpartKemPublicKey as string;
      const card = JSON.stringify(sealFriendCard(kem, full, keys.sign));
      // The requester's name+avatar also travel in the preview (shown pre-accept);
      // the addressee only ever has the full card.
      return t.side === "requester"
        ? {
            friendshipId: t.friendshipId,
            previewCard: JSON.stringify(sealFriendCard(kem, preview, keys.sign)),
            card,
          }
        : { friendshipId: t.friendshipId, card };
    });
  if (cards.length === 0) return;
  await friendsRequest(api, "/api/friends/refresh-cards", {
    method: "POST",
    body: JSON.stringify({ kidId: kid.id, cards }),
  });
}

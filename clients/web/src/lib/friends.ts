/**
 * Client-side friends layer: the shared `@dodi/client-state/friends` (E2EE
 * friend cards, requests, lists) and `friend-approvals` (the parent's
 * approvals) bound to this app's platform API. The app-facing names and
 * signatures stay unchanged. The server is blind: names/birthdates travel as
 * `SealedEnvelope` blobs only the recipient kid's kid key can open.
 */
import type { KidFriendKeys } from "@dodi/protocol";
import * as approvals from "@dodi/client-state/friend-approvals";
import * as friends from "@dodi/client-state/friends";
import type { Kid } from "@dodi/types/database";
import type { VaultSession } from "@dodi/vault";

import { dodi } from "@/lib/api";

export {
  type CardRefreshTarget,
  type DecodedFriend,
  type FriendshipStatus,
  type FriendshipView,
  type FriendTarget,
  FriendsError,
  decodeView,
  formatHandle,
  normalizeHandle,
  parseScannedCode,
} from "@dodi/client-state/friends";
export {
  type PendingApproval,
  readApprovalCounterpart,
} from "@dodi/client-state/friend-approvals";

/** Ensure the active kid has friend keys; generate + publish on first use. */
export function ensureFriendKeys(kid: Kid, session: VaultSession): Promise<KidFriendKeys> {
  return friends.ensureFriendKeys(dodi, kid, session);
}

export function lookupTarget(socialId: string): Promise<friends.FriendTarget> {
  return friends.lookupTarget(dodi, socialId);
}

/** Look up a friend by code, seal both cards to them, and send the request. */
export function sendFriendRequest(
  kid: Kid,
  session: VaultSession,
  rawHandle: string,
  nickname: string,
): Promise<void> {
  return friends.sendFriendRequest(dodi, kid, session, rawHandle, nickname);
}

export function fetchCardRefreshTargets(kidId: string): Promise<friends.CardRefreshTarget[]> {
  return friends.fetchCardRefreshTargets(dodi, kidId);
}

/**
 * Re-seal this kid's shared card (name / avatar / birthdate) to every friend.
 * Call after editing any shared field. Requires a DECRYPTED kid.
 */
export function refreshFriendCards(kid: Kid, session: VaultSession): Promise<void> {
  return friends.refreshFriendCards(dodi, kid, session);
}

export function fetchFriends(kidId: string): Promise<friends.FriendshipView[]> {
  return friends.fetchFriends(dodi, kidId);
}

export function fetchRequests(
  kidId: string,
  direction: "incoming" | "outgoing",
): Promise<friends.FriendshipView[]> {
  return friends.fetchRequests(dodi, kidId, direction);
}

export function fetchBlocked(kidId: string): Promise<friends.FriendshipView[]> {
  return friends.fetchBlocked(dodi, kidId);
}

/** Accept an incoming request: seal my card to the requester and confirm. */
export function acceptRequest(
  friendshipId: string,
  counterpartKemPublicKey: string | null,
  kid: Kid,
  myKeys: KidFriendKeys,
): Promise<void> {
  return friends.acceptRequest(dodi, friendshipId, counterpartKemPublicKey, kid, myKeys);
}

export function rejectRequest(friendshipId: string, kidId: string): Promise<void> {
  return friends.rejectRequest(dodi, friendshipId, kidId);
}

export function removeFriend(friendshipId: string, kidId: string): Promise<void> {
  return friends.removeFriend(dodi, friendshipId, kidId);
}

export function blockFriend(friendshipId: string, kidId: string): Promise<void> {
  return friends.blockFriend(dodi, friendshipId, kidId);
}

export function unblockFriend(friendshipId: string, kidId: string): Promise<void> {
  return friends.unblockFriend(dodi, friendshipId, kidId);
}

export function fetchApprovals(): Promise<approvals.PendingApproval[]> {
  return approvals.fetchApprovals(dodi);
}

export function setApproval(
  friendshipId: string,
  side: "requester" | "addressee",
  approve: boolean,
): Promise<void> {
  return approvals.setApproval(dodi, friendshipId, side, approve);
}

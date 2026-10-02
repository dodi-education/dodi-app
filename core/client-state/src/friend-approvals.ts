/**
 * Friendships across the parent's kids awaiting this parent's final approval
 * (the kids page's Incoming / Outgoing approvals). Both kids are shown by
 * real name: the parent's own child from the decrypted kid list, the
 * counterpart opened on the device (the kid's sealed nickname for outgoing,
 * the requester's sealed preview card for incoming), falling back to the
 * public friend code.
 */
import type { SealedEnvelope } from "@dodi/protocol/envelope";
import { openFriendCard, unwrapKidSecretKeys } from "@dodi/protocol/friend-card";
import type { FriendPreviewCard, Kid } from "@dodi/types/database";
import type { VaultSession } from "@dodi/vault";

import { friendsRequest } from "./friend-cards";
import type { PlatformApi } from "./platform";

export interface PendingApproval {
  friendshipId: string;
  side: "requester" | "addressee";
  kidId: string;
  counterpartKidId: string;
  counterpartSocialId: string | null;
  counterpartSignPublicKey: string | null;
  /** Requester's nickname ciphertext — set for outgoing (requester-side) approvals. */
  nickname: string | null;
  /** Requester's sealed preview card — set for incoming (addressee-side) approvals. */
  previewCard: string | null;
  createdAt: string;
}

export function fetchApprovals(api: PlatformApi): Promise<PendingApproval[]> {
  return friendsRequest<PendingApproval[]>(api, "/api/friends/approvals");
}

export function setApproval(
  api: PlatformApi,
  friendshipId: string,
  side: "requester" | "addressee",
  approve: boolean,
): Promise<void> {
  return friendsRequest(api, `/api/friends/${friendshipId}/approve`, {
    method: "POST",
    body: JSON.stringify({ side, approve }),
  });
}

/** Null-safe display of a social_id (the bare friend code, no prefix). */
export function formatHandle(socialId: string | null | undefined): string {
  return socialId ?? "";
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
      const keys = unwrapKidSecretKeys(session, kidSecretKeys);
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

export interface DecodedApproval extends PendingApproval {
  /** This parent's own child (always decryptable). */
  child: string;
  /** "<requester> wants to add <target>" parts. */
  requester: string;
  target: string;
}

/** Name both sides of each approval from the DECRYPTED kid list. */
export function decodeApprovals(
  items: PendingApproval[] | null,
  kids: Pick<Kid, "id" | "display_name" | "friend_secret_keys">[] | null,
  session: VaultSession | null,
): DecodedApproval[] {
  if (!items) return [];
  return items.map((a) => {
    const kid = kids?.find((p) => p.id === a.kidId) ?? null;
    const child = kid?.display_name ?? "—";
    const other =
      (session ? readApprovalCounterpart(session, a, kid?.friend_secret_keys ?? null) : null) ??
      formatHandle(a.counterpartSocialId);
    return {
      ...a,
      child,
      requester: a.side === "requester" ? child : other,
      target: a.side === "requester" ? other : child,
    };
  });
}

/** Split into Incoming (someone wants to add this child) and Outgoing. */
export function splitApprovals<T extends Pick<PendingApproval, "side">>(
  decoded: T[],
): { incoming: T[]; outgoing: T[] } {
  return {
    incoming: decoded.filter((a) => a.side === "addressee"),
    outgoing: decoded.filter((a) => a.side === "requester"),
  };
}

/** The busy key of one approval row (both sides of a friendship can be pending). */
export function approvalKey(a: Pick<PendingApproval, "friendshipId" | "side">): string {
  return a.friendshipId + a.side;
}

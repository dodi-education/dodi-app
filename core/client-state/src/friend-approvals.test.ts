import { describe, expect, it } from "vitest";

import { generateKidFriendKeys, publishedFriendKeys, sealFriendCard, wrapKidSecretKeys } from "@dodi/protocol/friend-card";
import type { Kid } from "@dodi/types/database";

import {
  approvalKey,
  decodeApprovals,
  fetchApprovals,
  readApprovalCounterpart,
  setApproval,
  splitApprovals,
  type PendingApproval,
} from "./friend-approvals";
import { FriendsError, ensureFriendKeys, refreshFriendCards } from "./friend-cards";
import { bodyOf, json, routedApi, unlockedVault } from "./parent-pages.test-support";

const base = {
  counterpartKidId: "other",
  counterpartSignPublicKey: null,
  nickname: null,
  previewCard: null,
  createdAt: "2026-01-01T00:00:00Z",
};

describe("friend approvals", () => {
  it("fetches and answers approvals; errors carry the server text", async () => {
    const api = routedApi({
      "/api/friends/approvals": json([]),
      "/api/friends/f1/approve": json({}),
    });
    await expect(fetchApprovals(api)).resolves.toEqual([]);
    await setApproval(api, "f1", "addressee", true);
    expect(bodyOf(api, "/api/friends/f1/approve")).toEqual({ side: "addressee", approve: true });

    const failing = routedApi({ "/api/friends/approvals": json({ error: "Forbidden" }, 403) });
    await expect(fetchApprovals(failing)).rejects.toEqual(new FriendsError("Forbidden", 403));
  });

  it("names both sides: nickname for outgoing, the sealed preview for incoming, else the code", () => {
    const { session } = unlockedVault();
    const kidKeys = generateKidFriendKeys();
    const requesterKeys = generateKidFriendKeys();
    const kids = [
      { id: "k1", display_name: "Mia", friend_secret_keys: wrapKidSecretKeys(session, kidKeys) },
    ] as unknown as Kid[];
    const outgoing: PendingApproval = {
      ...base,
      friendshipId: "f1",
      side: "requester",
      kidId: "k1",
      counterpartSocialId: "LEO-1",
      nickname: session.encryptField("Leo"),
    };
    const incoming: PendingApproval = {
      ...base,
      friendshipId: "f2",
      side: "addressee",
      kidId: "k1",
      counterpartSocialId: "ZOE-2",
      previewCard: JSON.stringify(
        sealFriendCard(publishedFriendKeys(kidKeys).kemPublicKey, { displayName: " Zoe ", avatarConfig: null }, requesterKeys.sign),
      ),
    };
    const unreadable: PendingApproval = { ...incoming, friendshipId: "f3", previewCard: "garbage" };

    expect(readApprovalCounterpart(session, outgoing, null)).toBe("Leo");
    const decoded = decodeApprovals([outgoing, incoming, unreadable], kids, session);
    expect(decoded.map((a) => [a.requester, a.target])).toEqual([
      ["Mia", "Leo"],
      ["Zoe", "Mia"],
      ["ZOE-2", "Mia"],
    ]);
    // Locked vault: the public code.
    expect(decodeApprovals([outgoing], kids, null)[0].target).toBe("LEO-1");
    expect(decodeApprovals(null, kids, session)).toEqual([]);

    const { incoming: inc, outgoing: out } = splitApprovals(decoded);
    expect(inc.map(approvalKey)).toEqual(["f2addressee", "f3addressee"]);
    expect(out.map(approvalKey)).toEqual(["f1requester"]);
  });
});

describe("friend cards", () => {
  it("generates and publishes friend keys on first use", async () => {
    const { session } = unlockedVault();
    const api = routedApi({ "/api/kids/k1/friend-keys": json({}) });
    const kid = { id: "k1", friend_secret_keys: null } as unknown as Kid;
    const keys = await ensureFriendKeys(api, kid, session);
    const body = bodyOf(api, "/api/kids/k1/friend-keys");
    expect(body.kemPublicKey).toBe(publishedFriendKeys(keys).kemPublicKey);
    expect(typeof body.sealedSecretKeys).toBe("string");
  });

  it("is a no-op without friendships (no key creation)", async () => {
    const { session } = unlockedVault();
    const api = routedApi({ "/api/friends/card-targets?kidId=k1": json([]) });
    await refreshFriendCards(api, { id: "k1", friend_secret_keys: null } as unknown as Kid, session);
    expect(api.request).toHaveBeenCalledTimes(1);
  });
});

import { useCallback, useEffect, useRef, useState } from "react";

import type { Profile } from "@dodi/types/database";

import {
  type CachedFriendKeys,
  keysForProfile,
} from "@/lib/friend-keys-cache";
import {
  type DecodedFriend,
  acceptRequest,
  blockFriend,
  decodeView,
  ensureFriendKeys,
  fetchBlocked,
  fetchFriends,
  fetchRequests,
  rejectRequest,
  removeFriend,
  sendFriendRequest,
  unblockFriend,
} from "@/lib/friends";
import { useProfiles } from "@/hooks/use-profiles";
import { useProfileStore } from "@/stores/profile-store";
import { useVaultStore } from "@/stores/vault-store";

interface FriendBuckets {
  friends: DecodedFriend[];
  incoming: DecodedFriend[];
  outgoing: DecodedFriend[];
  blocked: DecodedFriend[];
}

const EMPTY: FriendBuckets = { friends: [], incoming: [], outgoing: [], blocked: [] };

export interface UseFriends extends FriendBuckets {
  profile: Profile | null;
  /** This kid's own public handle (social_id). */
  myHandle: string | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  reload: () => void;
  /** Throws a FriendsError on failure so the Add-friend form can show it inline. */
  sendRequest: (handle: string, nickname: string) => Promise<void>;
  accept: (f: DecodedFriend) => Promise<void>;
  reject: (f: DecodedFriend) => Promise<void>;
  cancel: (f: DecodedFriend) => Promise<void>;
  remove: (f: DecodedFriend) => Promise<void>;
  block: (f: DecodedFriend) => Promise<void>;
  unblock: (f: DecodedFriend) => Promise<void>;
}

/**
 * Loads and decrypts a kid's friends, requests and blocked list, and exposes the
 * mutating actions. Friend keys are generated + published on first use.
 */
export function useFriends(profileId: string): UseFriends {
  const { profiles } = useProfiles();
  const profile = profiles?.find((p) => p.id === profileId) ?? null;

  const keysRef = useRef<CachedFriendKeys | null>(null);
  const [buckets, setBuckets] = useState<FriendBuckets>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!profile) return;
    const session = useVaultStore.getState().session;
    if (!session) {
      setError("locked");
      setLoading(false);
      return;
    }
    try {
      // Keys are scoped to this profile: never reuse another kid's keys after a
      // profile switch, or their sealed cards won't open (names show as "—").
      const cached = keysForProfile(keysRef.current, profile.id);
      const hadKeys = profile.friend_secret_keys != null || cached != null;
      const keys = cached ?? (await ensureFriendKeys(profile, session));
      keysRef.current = { profileId: profile.id, keys };
      // First-time publish: refresh the cache so our public key is visible.
      if (!hadKeys) useProfileStore.getState().invalidate();

      const [friendsV, incomingV, outgoingV, blockedV] = await Promise.all([
        fetchFriends(profileId),
        fetchRequests(profileId, "incoming"),
        fetchRequests(profileId, "outgoing"),
        fetchBlocked(profileId),
      ]);
      setBuckets({
        friends: friendsV.map((v) => decodeView(v, keys, session)),
        incoming: incomingV.map((v) => decodeView(v, keys, session)),
        outgoing: outgoingV.map((v) => decodeView(v, keys, session)),
        blocked: blockedV.map((v) => decodeView(v, keys, session)),
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setLoading(false);
    }
  }, [profile, profileId]);

  useEffect(() => {
    // Mount/profile-change fetch: reload() decrypts and sets state asynchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (profile) void reload();
  }, [profile, reload]);

  const runAction = useCallback(
    async (fn: () => Promise<void>) => {
      setBusy(true);
      try {
        await fn();
        await reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : "error");
      } finally {
        setBusy(false);
      }
    },
    [reload],
  );

  const sendRequest = useCallback(
    async (handle: string, nickname: string) => {
      const session = useVaultStore.getState().session;
      if (!profile || !session) throw new Error("locked");
      await sendFriendRequest(profile, session, handle, nickname);
      await reload();
    },
    [profile, reload],
  );

  return {
    ...buckets,
    profile,
    myHandle: profile?.social_id ?? null,
    loading: loading && profile != null,
    busy,
    error,
    reload: () => void reload(),
    sendRequest,
    accept: (f) =>
      runAction(() => {
        const keys = profile ? keysForProfile(keysRef.current, profile.id) : null;
        if (!profile || !keys) throw new Error("locked");
        return acceptRequest(f.id, f.counterpartKemPublicKey, profile, keys);
      }),
    reject: (f) => runAction(() => rejectRequest(f.id, profileId)),
    cancel: (f) => runAction(() => removeFriend(f.id, profileId)),
    remove: (f) => runAction(() => removeFriend(f.id, profileId)),
    block: (f) => runAction(() => blockFriend(f.id, profileId)),
    unblock: (f) => runAction(() => unblockFriend(f.id, profileId)),
  };
}

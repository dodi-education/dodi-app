import { useCallback, useEffect, useRef, useState } from "react";
import {
  type CachedFriendKeys,
  type DecodedFriend,
  EMPTY_FRIEND_BUCKETS,
  type FriendBuckets,
  acceptRequest,
  blockFriend,
  keysForKid,
  loadFriendBuckets,
  rejectRequest,
  removeFriend,
  sendFriendRequest,
  unblockFriend,
} from "@dodi/client-state/friends";
import type { Kid } from "@dodi/types/database";

import { api } from "@/adapters/platform";
import { useKidStore, useVaultStore } from "@/lib/client-state";
import { useKids } from "@/lib/use-kids";

export interface UseFriends extends FriendBuckets {
  kid: Kid | null;
  /** This kid's own public handle (social_id). */
  myHandle: string | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  reload: () => void;
  /** `reload`, settling when the lists are in (pull to refresh). */
  refresh: () => Promise<void>;
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
 * A kid's friends, requests and blocked list, decrypted on the device, plus
 * the mutating actions (web: hooks/use-friends). Friend keys are generated +
 * published on first use; the shared flows are `@dodi/client-state/friends`.
 */
export function useFriends(kidId: string): UseFriends {
  const { kids } = useKids();
  const kid = kids?.find((p) => p.id === kidId) ?? null;

  const keysRef = useRef<CachedFriendKeys | null>(null);
  const [buckets, setBuckets] = useState<FriendBuckets>(EMPTY_FRIEND_BUCKETS);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!kid) return;
    const session = useVaultStore.getState().session;
    if (!session) {
      setError("locked");
      setLoading(false);
      return;
    }
    try {
      // Keys are scoped to this kid: never reuse another kid's keys after a switch.
      const loaded = await loadFriendBuckets(api, kid, session, keysRef.current);
      keysRef.current = loaded.keys;
      // First-time publish: refresh the cache so our public key is visible.
      if (loaded.hasPublishedKeys) useKidStore.getState().invalidate();
      setBuckets(loaded.buckets);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setLoading(false);
    }
  }, [kid]);

  useEffect(() => {
    // Mount/kid-change fetch: reload() decrypts and sets state asynchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (kid) void reload();
  }, [kid, reload]);

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
      if (!kid || !session) throw new Error("locked");
      await sendFriendRequest(api, kid, session, handle, nickname);
      await reload();
    },
    [kid, reload],
  );

  return {
    ...buckets,
    kid,
    myHandle: kid?.social_id ?? null,
    loading: loading && kid != null,
    busy,
    error,
    reload: () => void reload(),
    refresh: reload,
    sendRequest,
    accept: (f) =>
      runAction(() => {
        const keys = kid ? keysForKid(keysRef.current, kid.id) : null;
        if (!kid || !keys) throw new Error("locked");
        return acceptRequest(api, f.id, f.counterpartKemPublicKey, kid, keys);
      }),
    reject: (f) => runAction(() => rejectRequest(api, f.id, kidId)),
    cancel: (f) => runAction(() => removeFriend(api, f.id, kidId)),
    remove: (f) => runAction(() => removeFriend(api, f.id, kidId)),
    block: (f) => runAction(() => blockFriend(api, f.id, kidId)),
    unblock: (f) => runAction(() => unblockFriend(api, f.id, kidId)),
  };
}

import { useCallback, useEffect, useRef, useState } from "react";

import type { Kid } from "@dodi/types/database";

import {
  EMPTY_FRIEND_BUCKETS,
  type FriendBuckets,
  loadFriendBuckets,
} from "@dodi/client-state/friends";

import { dodi } from "@/lib/api";
import {
  type CachedFriendKeys,
  keysForKid,
} from "@/lib/friend-keys-cache";
import {
  type DecodedFriend,
  acceptRequest,
  blockFriend,
  rejectRequest,
  removeFriend,
  sendFriendRequest,
  unblockFriend,
} from "@/lib/friends";
import { useKids } from "@/hooks/use-kids";
import { useKidStore } from "@/stores/kid-store";
import { useVaultStore } from "@/stores/vault-store";

const EMPTY: FriendBuckets = EMPTY_FRIEND_BUCKETS;

export interface UseFriends extends FriendBuckets {
  kid: Kid | null;
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
export function useFriends(kidId: string): UseFriends {
  const { kids } = useKids();
  const kid = kids?.find((p) => p.id === kidId) ?? null;

  const keysRef = useRef<CachedFriendKeys | null>(null);
  const [buckets, setBuckets] = useState<FriendBuckets>(EMPTY);
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
      // Keys are scoped to this kid: never reuse another kid's keys after a
      // kid switch, or their sealed cards won't open (names show as "—").
      const loaded = await loadFriendBuckets(dodi, kid, session, keysRef.current);
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
      await sendFriendRequest(kid, session, handle, nickname);
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
    sendRequest,
    accept: (f) =>
      runAction(() => {
        const keys = kid ? keysForKid(keysRef.current, kid.id) : null;
        if (!kid || !keys) throw new Error("locked");
        return acceptRequest(f.id, f.counterpartKemPublicKey, kid, keys);
      }),
    reject: (f) => runAction(() => rejectRequest(f.id, kidId)),
    cancel: (f) => runAction(() => removeFriend(f.id, kidId)),
    remove: (f) => runAction(() => removeFriend(f.id, kidId)),
    block: (f) => runAction(() => blockFriend(f.id, kidId)),
    unblock: (f) => runAction(() => unblockFriend(f.id, kidId)),
  };
}

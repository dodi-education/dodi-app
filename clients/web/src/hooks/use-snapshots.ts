import { useCallback, useEffect, useRef, useState } from "react";

import {
  type CachedFriendKeys,
  keysForKid,
} from "@/lib/friend-keys-cache";
import { decodeView, ensureFriendKeys, fetchFriends } from "@/lib/friends";
import {
  type SnapshotView,
  decodeSnapshotInfo,
  deleteSnapshot,
  fetchSnapshots,
} from "@/lib/snapshots";
import { useKids } from "@/hooks/use-kids";
import { useVaultStore } from "@/stores/vault-store";
import type { SnapshotInfoV1 } from "@dodi/types/games";

export interface DecodedSnapshot {
  view: SnapshotView;
  /** Null = blob unreadable (wrong keys / tampered) — render a fallback card. */
  info: SnapshotInfoV1 | null;
  /** Decrypted sender name for received snapshots ("from Lea"). */
  senderName: string | null;
}

export interface UseSnapshots {
  snapshots: DecodedSnapshot[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  remove: (id: string) => Promise<void>;
}

/**
 * Loads and decrypts a kid's snapshot collection (own + received). Friend keys
 * are only touched when received rows exist — browsing your own snapshots never
 * generates/publishes a friend identity as a side effect.
 */
export function useSnapshots(kidId: string): UseSnapshots {
  const { kids } = useKids();
  const kid = kids?.find((k) => k.id === kidId) ?? null;

  const keysRef = useRef<CachedFriendKeys | null>(null);
  const [snapshots, setSnapshots] = useState<DecodedSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
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
      const views = await fetchSnapshots(kid.id);

      const hasReceived = views.some((v) => v.origin === "received");
      let keys = keysForKid(keysRef.current, kid.id);
      const senderNames = new Map<string, string>();
      if (hasReceived) {
        keys = keys ?? (await ensureFriendKeys(kid, session));
        keysRef.current = { kidId: kid.id, keys };
        // Sender names come from the kid's own decrypted friend cards.
        try {
          for (const friendView of await fetchFriends(kid.id)) {
            const decoded = decodeView(friendView, keys, session);
            const name = decoded.name ?? decoded.nickname;
            if (name) senderNames.set(friendView.counterpartKidId, name);
          }
        } catch {
          // Names are cosmetic — the collection still renders without them.
        }
      }

      setSnapshots(
        views.map((view) => ({
          view,
          info: decodeSnapshotInfo(view, session, keys),
          senderName: view.senderKidId
            ? (senderNames.get(view.senderKidId) ?? null)
            : null,
        })),
      );
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

  const remove = useCallback(
    async (id: string) => {
      setSnapshots((prev) => prev.filter((s) => s.view.id !== id));
      try {
        await deleteSnapshot(id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "error");
        await reload();
      }
    },
    [reload],
  );

  return { snapshots, loading, error, reload, remove };
}

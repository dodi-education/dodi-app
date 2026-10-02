import { useCallback, useEffect, useRef, useState } from "react";

import {
  type CachedFriendKeys,
  type DecodedSnapshot,
  loadKidSnapshots,
} from "@dodi/client-state/snapshots";
import { deleteSnapshot, snapshotDeps } from "@/lib/snapshots";
import { useKids } from "@/hooks/use-kids";
import { useVaultStore } from "@/stores/vault-store";

export type { DecodedSnapshot };

export interface UseSnapshots {
  snapshots: DecodedSnapshot[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  remove: (id: string) => Promise<void>;
}

/**
 * Loads and decrypts a kid's snapshot collection (own + received) through the
 * shared loader (`loadKidSnapshots`). Friend keys are only touched when
 * received rows exist, and are remembered per kid across reloads.
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
      const loaded = await loadKidSnapshots(snapshotDeps, kid, session, keysRef.current);
      keysRef.current = loaded.keys;
      setSnapshots(loaded.snapshots);
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

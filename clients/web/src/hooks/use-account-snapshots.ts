import { useCallback, useEffect, useState } from "react";

import {
  type AccountSnapshot,
  type FriendKidOption,
  loadAccountSnapshots,
} from "@dodi/client-state/snapshots";
import { snapshotDeps } from "@/lib/snapshots";
import { useKids } from "@/hooks/use-kids";
import { useVaultStore } from "@/stores/vault-store";

export type { AccountSnapshot, FriendKidOption };

export interface UseAccountSnapshots {
  snapshots: AccountSnapshot[];
  /**
   * Kids from OTHER accounts that exchanged snapshots with this family,
   * name-sorted. Siblings can be friends too, so own kids are excluded even
   * when they appear on the friend side of a row.
   */
  friendKids: FriendKidOption[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Loads and decrypts every kid's snapshot collection for the parent overview
 * through the shared loader (`loadAccountSnapshots`): own + received + the
 * hidden autosave slots, newest first, plus the friend kids for the filter.
 */
export function useAccountSnapshots(): UseAccountSnapshots {
  const { kids } = useKids();

  const [snapshots, setSnapshots] = useState<AccountSnapshot[]>([]);
  const [friendKids, setFriendKids] = useState<FriendKidOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!kids) return;
    const session = useVaultStore.getState().session;
    if (!session) {
      setError("locked");
      setLoading(false);
      return;
    }
    try {
      const loaded = await loadAccountSnapshots(snapshotDeps, kids, session);
      setSnapshots(loaded.snapshots);
      setFriendKids(loaded.friendKids);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setLoading(false);
    }
  }, [kids]);

  useEffect(() => {
    // Mount/kids-change fetch: reload() decrypts and sets state asynchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (kids) void reload();
  }, [kids, reload]);

  return { snapshots, friendKids, loading, error, reload };
}

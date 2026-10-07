import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AccountSnapshot,
  type FriendKidOption,
  loadAccountSnapshots,
} from "@dodi/client-state/snapshots";

import { useVaultStore } from "@/lib/client-state";
import { snapshotDeps } from "@/lib/snapshots";
import { useKids } from "@/lib/use-kids";

interface Loaded {
  snapshots: AccountSnapshot[];
  friendKids: FriendKidOption[];
  error: string | null;
}

/**
 * Every kid's decrypted snapshot collection for the parent overview (web:
 * hooks/use-account-snapshots): own + received + autosave slots, newest
 * first, plus the friend kids for the kid filter. `error` is "locked" while
 * the vault is closed.
 */
export function useAccountSnapshots(): {
  snapshots: AccountSnapshot[];
  friendKids: FriendKidOption[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  /** `reload`, settling when the snapshots are in (pull to refresh). */
  refresh: () => Promise<void>;
} {
  const { kids } = useKids();
  const session = useVaultStore((s) => s.session);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  // Each load takes a ticket; only the latest one lands.
  const ticketRef = useRef(0);

  const load = useCallback(async (): Promise<void> => {
    if (!kids || !session) return;
    const ticket = ++ticketRef.current;
    try {
      const result = await loadAccountSnapshots(snapshotDeps, kids, session);
      if (ticket === ticketRef.current) setLoaded({ ...result, error: null });
    } catch (e) {
      if (ticket !== ticketRef.current) return;
      setLoaded((prev) => ({
        snapshots: prev?.snapshots ?? [],
        friendKids: prev?.friendKids ?? [],
        error: e instanceof Error ? e.message : "error",
      }));
    }
  }, [kids, session]);

  // Mount / kids / vault change (a newer load supersedes one in flight).
  useEffect(() => {
    void load();
  }, [load]);

  const reload = useCallback(() => void load(), [load]);

  if (!session) return { snapshots: [], friendKids: [], loading: false, error: "locked", reload, refresh: load };
  return {
    snapshots: loaded?.snapshots ?? [],
    friendKids: loaded?.friendKids ?? [],
    loading: loaded === null,
    error: loaded?.error ?? null,
    reload,
    refresh: load,
  };
}

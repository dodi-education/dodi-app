import { useCallback, useEffect, useState } from "react";
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
} {
  const { kids } = useKids();
  const session = useVaultStore((s) => s.session);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    if (!kids || !session) return;
    let isCurrent = true;
    loadAccountSnapshots(snapshotDeps, kids, session).then(
      (result) => {
        if (isCurrent) setLoaded({ ...result, error: null });
      },
      (e: unknown) => {
        if (!isCurrent) return;
        setLoaded((prev) => ({
          snapshots: prev?.snapshots ?? [],
          friendKids: prev?.friendKids ?? [],
          error: e instanceof Error ? e.message : "error",
        }));
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [kids, session, reloadNonce]);

  const reload = useCallback(() => setReloadNonce((n) => n + 1), []);

  if (!session) return { snapshots: [], friendKids: [], loading: false, error: "locked", reload };
  return {
    snapshots: loaded?.snapshots ?? [],
    friendKids: loaded?.friendKids ?? [],
    loading: loaded === null,
    error: loaded?.error ?? null,
    reload,
  };
}

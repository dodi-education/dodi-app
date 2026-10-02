import { useCallback, useEffect, useRef, useState } from "react";
import {
  type CachedFriendKeys,
  type DecodedSnapshot,
  deleteSnapshot,
  loadKidSnapshots,
} from "@dodi/client-state/snapshots";

import { useVaultStore } from "@/lib/client-state";
import { snapshotDeps } from "@/lib/snapshots";
import { useKids } from "@/lib/use-kids";

interface Loaded {
  kidId: string;
  snapshots: DecodedSnapshot[];
  error: string | null;
}

/**
 * A kid's decrypted snapshot collection, own + received (web:
 * hooks/use-snapshots). Friend keys are only touched when received rows
 * exist, and are remembered per kid across reloads. Loads once the vault is
 * open; `error` is "locked" until then.
 */
export function useSnapshots(kidId: string): {
  snapshots: DecodedSnapshot[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  remove: (id: string) => Promise<void>;
} {
  const { kids } = useKids();
  const kid = kids?.find((k) => k.id === kidId) ?? null;
  const session = useVaultStore((s) => s.session);

  const keysRef = useRef<CachedFriendKeys | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    if (!kid || !session) return;
    let isCurrent = true;
    loadKidSnapshots(snapshotDeps, kid, session, keysRef.current).then(
      (result) => {
        if (!isCurrent) return;
        keysRef.current = result.keys;
        setLoaded({ kidId: kid.id, snapshots: result.snapshots, error: null });
      },
      (e: unknown) => {
        if (!isCurrent) return;
        setLoaded((prev) => ({
          kidId: kid.id,
          snapshots: prev?.kidId === kid.id ? prev.snapshots : [],
          error: e instanceof Error ? e.message : "error",
        }));
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [kid, session, reloadNonce]);

  const reload = useCallback(() => setReloadNonce((n) => n + 1), []);

  const remove = useCallback(
    async (id: string) => {
      setLoaded((prev) => (prev ? { ...prev, snapshots: prev.snapshots.filter((s) => s.view.id !== id) } : prev));
      try {
        await deleteSnapshot(snapshotDeps, id);
      } catch (e) {
        setLoaded((prev) => (prev ? { ...prev, error: e instanceof Error ? e.message : "error" } : prev));
        reload();
      }
    },
    [reload],
  );

  const current = loaded?.kidId === kidId ? loaded : null;
  if (!session) return { snapshots: [], loading: false, error: "locked", reload, remove };
  return {
    snapshots: current?.snapshots ?? [],
    loading: current === null,
    error: current?.error ?? null,
    reload,
    remove,
  };
}

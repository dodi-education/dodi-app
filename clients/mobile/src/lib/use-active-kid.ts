import { useEffect, useMemo } from "react";
import { computeNeedsPin } from "@dodi/client-state/active-kid-store";
import type { Kid } from "@dodi/types/database";

import { useActiveKidStore } from "@/lib/client-state";
import { useKids } from "@/lib/use-kids";

export interface ActiveKid {
  /** Decrypted kid list; null while still loading. */
  kids: Kid[] | null;
  activeKid: Kid | null;
  activeKidId: string | null;
  /** The active profile is PIN-locked and not yet unlocked this app session. */
  needsPin: boolean;
}

/**
 * Reactive access to the active kid (web: hooks/use-active-kid). Resolves the
 * active kid from the loaded list (persisted or first-available) into the
 * shared store, then returns it reactively so consumers update on entry,
 * switch and unlock.
 */
export function useActiveKid(): ActiveKid {
  const { kids } = useKids();
  const activeKidId = useActiveKidStore((s) => s.activeKidId);
  const unlockedKidIds = useActiveKidStore((s) => s.unlockedKidIds);
  const resolve = useActiveKidStore((s) => s.resolve);

  useEffect(() => {
    if (kids) resolve(kids);
  }, [kids, resolve]);

  const activeKid = useMemo(() => kids?.find((k) => k.id === activeKidId) ?? null, [kids, activeKidId]);

  return {
    kids,
    activeKid,
    activeKidId,
    needsPin: computeNeedsPin(activeKid, unlockedKidIds),
  };
}

import { useMemo } from "react";
import type { CompanionLook } from "@dodi/character/character-look";
import { activeCompanionOf, companionLookOf, companionNameOf } from "@dodi/client-state/companions";
import type { Kid, KidCompanion } from "@dodi/types/database";

import { useActiveKidStore, useCompanionStageStore, useKidStore } from "@/lib/client-state";

export interface ActiveCompanion {
  kid: Kid | null;
  companion: KidCompanion | null;
  name: string;
  /** The saved look, sanitized. */
  savedLook: CompanionLook;
  /** What shows: a look being tried on in the Playground, else the saved one. */
  look: CompanionLook;
}

/** The active kid's active companion, from the decrypted kid cache (web: hooks/use-active-companion). */
export function useActiveCompanion(): ActiveCompanion {
  const activeKidId = useActiveKidStore((s) => s.activeKidId);
  const kid = useKidStore((s) =>
    activeKidId ? (s.byId[activeKidId] ?? s.list?.find((k) => k.id === activeKidId) ?? null) : null,
  );
  const previewLook = useCompanionStageStore((s) => s.previewLook);
  return useMemo(() => {
    const companion = kid ? activeCompanionOf(kid) : null;
    const savedLook = companionLookOf(companion);
    return { kid, companion, name: companionNameOf(companion), savedLook, look: previewLook ?? savedLook };
  }, [kid, previewLook]);
}

"use client";

import { useMemo } from "react";

import { activeCompanionOf, companionLookOf, companionNameOf } from "@dodi/client-state/companions";
import type { CompanionLook } from "@dodi/character/character-look";
import type { Kid, KidCompanion } from "@dodi/types/database";

import { useActiveKidStore } from "@/stores/active-kid-store";
import { useCompanionStageStore } from "@/stores/companion-stage-store";
import { useKidStore } from "@/stores/kid-store";

export interface ActiveCompanion {
  kid: Kid | null;
  companion: KidCompanion | null;
  name: string;
  /** The saved look, sanitized. */
  savedLook: CompanionLook;
  /** What shows: a look being tried on in the Playground, else the saved one. */
  look: CompanionLook;
}

/** The active kid's active companion, from the decrypted kid cache. */
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

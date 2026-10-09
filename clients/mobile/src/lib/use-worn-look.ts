import { useEffect, useMemo, useState } from "react";

import { hasCustomAssetRefs, lookWithKnownAssets } from "@dodi/client-state/character-asset-store";
import type { CompanionLook } from "@dodi/character/character-look";

import { useCharacterAssetStore } from "@/lib/client-state";

/**
 * The look as the 3D character can wear it: the family's own avatars and
 * accessories only while they exist (a deleted one falls back to the catalog).
 * Null while the asset list it needs is loading. Web: hooks/use-worn-look.
 */
export function useWornLook(look: CompanionLook): CompanionLook | null {
  const assets = useCharacterAssetStore((s) => s.assets);
  const load = useCharacterAssetStore((s) => s.load);
  const [hasListFailed, setHasListFailed] = useState(false);
  const needsList = hasCustomAssetRefs(look) && assets === null;

  useEffect(() => {
    if (!needsList) return;
    let isCurrent = true;
    load().catch(() => {
      if (isCurrent) setHasListFailed(true); // offline or locked: show the catalog look
    });
    return () => {
      isCurrent = false;
    };
  }, [needsList, load]);

  return useMemo(() => lookWithKnownAssets(look, hasListFailed && !assets ? [] : assets), [look, assets, hasListFailed]);
}

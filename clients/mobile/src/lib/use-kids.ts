import { useEffect, useState } from "react";
import type { Kid } from "@dodi/types/database";

import { useKidStore, useVaultStore } from "@/lib/client-state";

/**
 * The decrypted kid list from the shared cache (web: hooks/use-kids). Loads
 * once; retries when the vault session appears (a load before unlock rejects
 * with "Vault is locked") and after the cache was invalidated.
 */
export function useKids(): { kids: Kid[] | null; loading: boolean; error: string | null } {
  const list = useKidStore((s) => s.list);
  const loadList = useKidStore((s) => s.loadList);
  const session = useVaultStore((s) => s.session);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (list !== null) return;
    loadList()
      .then(() => setError(null))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load kids"));
  }, [list, loadList, session]);

  // A later load (e.g. pull to refresh) that brought the list clears an earlier failure.
  return { kids: list, loading: list === null && error === null, error: list === null ? error : null };
}

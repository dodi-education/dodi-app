import { useEffect, useState } from "react";

import { useKidStore } from "@/stores/kid-store";
import { useVaultStore } from "@/stores/vault-store";
import type { Kid } from "@dodi/types/database";

/**
 * Client hook over the kid cache: loads the decrypted kid list once
 * (via the VaultSession) and returns it reactively. Reused across reader pages
 * so navigation shares one fetch + decrypt.
 */
export function useKids(): {
  kids: Kid[] | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
} {
  const list = useKidStore((s) => s.list);
  const loadList = useKidStore((s) => s.loadList);
  // Consumers outside the VaultGate (e.g. the breadcrumb bar) may mount before
  // the vault unlocks; that first load rejects with "Vault is locked". Retry
  // once the session appears so the list resolves without a manual refresh.
  const session = useVaultStore((s) => s.session);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (list !== null) return;
    loadList()
      .then(() => setError(null))
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to load kids"),
      );
  }, [list, loadList, session]);

  return {
    kids: list,
    loading: list === null && error === null,
    error,
    reload: () => {
      void useKidStore.getState().loadList(true);
    },
  };
}

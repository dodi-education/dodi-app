import { useEffect, useState } from "react";

import { useProfileStore } from "@/stores/profile-store";
import type { Profile } from "@/types/database";

/**
 * Client hook over the profile cache: loads the decrypted profile list once
 * (via the VaultSession) and returns it reactively. Reused across reader pages
 * so navigation shares one fetch + decrypt.
 */
export function useProfiles(): {
  profiles: Profile[] | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
} {
  const list = useProfileStore((s) => s.list);
  const loadList = useProfileStore((s) => s.loadList);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (list === null) {
      loadList().catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to load profiles"),
      );
    }
  }, [list, loadList]);

  return {
    profiles: list,
    loading: list === null && error === null,
    error,
    reload: () => {
      void useProfileStore.getState().loadList(true);
    },
  };
}

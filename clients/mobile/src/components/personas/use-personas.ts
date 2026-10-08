import { useEffect, useState } from "react";
import { loadPersonas } from "@dodi/client-state/personas";
import type { Persona } from "@dodi/types/database";

import { api } from "@/adapters/platform";
import { useVaultStore } from "@/lib/client-state";

/** The account's personas, decrypted (null while loading). Web: components/parent/use-personas. */
export function usePersonas(): Persona[] | null {
  const session = useVaultStore((s) => s.session);
  const [personas, setPersonas] = useState<Persona[] | null>(null);
  useEffect(() => {
    if (!session) return;
    let isCancelled = false;
    void loadPersonas(api, session).then((list) => {
      if (!isCancelled) setPersonas(list);
    });
    return () => {
      isCancelled = true;
    };
  }, [session]);
  return personas;
}

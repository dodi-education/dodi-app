import { dodi } from "@/lib/api";
import { useEffect, useState } from "react";

import { decryptPersona } from "@dodi/vault";
import { useVaultStore } from "@/stores/vault-store";
import type { Persona } from "@dodi/types/database";

interface PersonaSummary {
  id: string;
  name: string;
}

/**
 * Client hook for persona id → name lookup. Account personas store `name` as
 * E2EE ciphertext, so each is decrypted via the vault session before the map is
 * built; the system default is plaintext and passes through.
 */
export function usePersonas(): { nameById: Map<string, string>; loading: boolean } {
  const [personas, setPersonas] = useState<PersonaSummary[] | null>(null);
  const session = useVaultStore((s) => s.session);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    dodi.request("/api/personas")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Persona[]) => {
        if (cancelled) return;
        setPersonas(
          data.map((p) => {
            const dec = decryptPersona(session, p);
            return { id: dec.id, name: dec.name };
          }),
        );
      })
      .catch(() => {
        if (!cancelled) setPersonas([]);
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  return {
    nameById: new Map((personas ?? []).map((p) => [p.id, p.name])),
    loading: personas === null,
  };
}

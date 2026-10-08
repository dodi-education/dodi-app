"use client";

import { useEffect, useState } from "react";

import { loadPersonas } from "@dodi/client-state/personas";
import type { Persona } from "@dodi/types/database";

import { dodi } from "@/lib/api";
import { useVaultStore } from "@/stores/vault-store";

/** The account's personas, decrypted (null while loading). */
export function usePersonas(): Persona[] | null {
  const session = useVaultStore((s) => s.session);
  const [personas, setPersonas] = useState<Persona[] | null>(null);
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    void loadPersonas(dodi, session).then((list) => {
      if (!cancelled) setPersonas(list);
    });
    return () => {
      cancelled = true;
    };
  }, [session]);
  return personas;
}

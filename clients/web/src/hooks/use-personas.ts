import { dodi } from "@/lib/api";
import { useEffect, useState } from "react";

interface PersonaSummary {
  id: string;
  name: string;
}

/**
 * Client hook for persona id → name lookup. Persona `name` is plaintext
 * operational metadata (only the `soul` is sensitive), so this is a plain fetch.
 */
export function usePersonas(): { nameById: Map<string, string>; loading: boolean } {
  const [personas, setPersonas] = useState<PersonaSummary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    dodi.request("/api/personas")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (!cancelled) setPersonas(data as PersonaSummary[]);
      })
      .catch(() => {
        if (!cancelled) setPersonas([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    nameById: new Map((personas ?? []).map((p) => [p.id, p.name])),
    loading: personas === null,
  };
}

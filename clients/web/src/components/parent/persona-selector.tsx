"use client";

import { dodi } from "@/lib/api";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { loadPersonas } from "@dodi/client-state/personas";
import { setKidPersona } from "@dodi/client-state/kid-profile";
import { fieldSelectClass } from "@/components/parent/rows";
import { parentFlowDeps } from "@/lib/parent-flow-deps";
import { useVaultStore } from "@/stores/vault-store";
import type { Persona } from "@dodi/types/database";

interface PersonaSelectorProps {
  kidId: string;
  value: string | null;
  onChange: (personaId: string | null) => void;
}

export function PersonaSelector({ kidId, value, onChange }: PersonaSelectorProps) {
  const t = useTranslations("personas");
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const session = useVaultStore((s) => s.session);

  useEffect(() => {
    if (!session) return;
    // Account personas are encrypted; names decrypted for the dropdown labels.
    void loadPersonas(dodi, session).then((list) => {
      setPersonas(list);
      setLoading(false);
    });
  }, [session]);

  async function handleChange(personaId: string) {
    const newValue = personaId || null;
    onChange(newValue);

    // Kid rows embed the active persona: the flow mirrors the change into
    // the cache (names here are already decrypted, matching the cached kid).
    await setKidPersona(parentFlowDeps(), kidId, newValue, personas);
  }

  if (loading) return null;

  return (
    <select
      id="persona"
      value={value ?? ""}
      onChange={(e) => handleChange(e.target.value)}
      className={fieldSelectClass}
    >
      <option value="">{t("useDefault")}</option>
      {personas.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}{p.is_system_default ? ` (${t("default")})` : ""}
        </option>
      ))}
    </select>
  );
}

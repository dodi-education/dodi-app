"use client";

import { useTranslations } from "next-intl";

import type { Persona } from "@dodi/types/database";

import { fieldSelectClass } from "@/components/parent/rows";

interface PersonaSelectorProps {
  id?: string;
  personas: Persona[];
  value: string | null;
  onChange: (personaId: string | null) => void;
  disabled?: boolean;
}

/** Picks a companion's persona (empty = the default persona). */
export function PersonaSelector({ id = "persona", personas, value, onChange, disabled }: PersonaSelectorProps) {
  const t = useTranslations("personas");
  return (
    <select
      id={id}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className={fieldSelectClass}
      disabled={disabled}
    >
      <option value="">{t("useDefault")}</option>
      {personas
        .filter((p) => !p.is_system_default)
        .map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
    </select>
  );
}

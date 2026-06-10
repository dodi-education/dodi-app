"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import type { Persona } from "@/types/database";

interface PersonaSelectorProps {
  profileId: string;
  value: string | null;
  onChange: (personaId: string | null) => void;
}

export function PersonaSelector({ profileId, value, onChange }: PersonaSelectorProps) {
  const t = useTranslations("personas");
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const response = await fetch("/api/personas");
      if (response.ok) {
        const data: Persona[] = await response.json();
        setPersonas(data);
      }
      setLoading(false);
    }
    load();
  }, []);

  async function handleChange(personaId: string) {
    const newValue = personaId || null;
    onChange(newValue);

    await fetch(`/api/profiles/${profileId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active_persona_id: newValue }),
    });
  }

  if (loading) return null;

  return (
    <select
      id="persona"
      value={value ?? ""}
      onChange={(e) => handleChange(e.target.value)}
      className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm outline-none transition-[color,box-shadow,border-color] hover:border-faint focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary-soft-2 sm:w-[250px]"
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

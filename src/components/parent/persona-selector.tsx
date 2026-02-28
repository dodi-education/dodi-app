"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Label } from "@/components/ui/label";

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
    <div className="flex flex-col gap-2">
      <Label htmlFor="persona">{t("selectorLabel")}</Label>
      <select
        id="persona"
        value={value ?? ""}
        onChange={(e) => handleChange(e.target.value)}
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <option value="">{t("useDefault")}</option>
        {personas.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}{p.is_system_default ? ` (${t("default")})` : ""}
          </option>
        ))}
      </select>
      <p className="text-xs text-muted-foreground">{t("selectorHint")}</p>
    </div>
  );
}

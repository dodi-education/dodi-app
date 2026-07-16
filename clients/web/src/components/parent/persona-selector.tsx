"use client";

import { dodi } from "@/lib/api";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { decryptPersona } from "@dodi/vault";
import { useKidStore } from "@/stores/kid-store";
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
    async function load() {
      const response = await dodi.request("/api/personas");
      if (response.ok) {
        const data: Persona[] = await response.json();
        // Account personas are encrypted; decrypt names for the dropdown labels.
        setPersonas(data.map((p) => decryptPersona(session!, p)));
      }
      setLoading(false);
    }
    load();
  }, [session]);

  async function handleChange(personaId: string) {
    const newValue = personaId || null;
    onChange(newValue);

    const res = await dodi.request(`/api/kids/${kidId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active_persona_id: newValue }),
    });

    // Kid rows embed the active persona — mirror the change into the cache
    // (names here are already decrypted, matching the cached kid shape).
    if (res.ok) {
      const picked = newValue
        ? (personas.find((p) => p.id === newValue) ?? null)
        : null;
      useKidStore.getState().patchLocal(kidId, {
        active_persona: picked
          ? {
              id: picked.id,
              name: picked.name,
              account_id: picked.account_id,
              is_system_default: picked.is_system_default,
            }
          : null,
      });
    }
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

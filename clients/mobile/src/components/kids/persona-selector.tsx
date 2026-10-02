import { useEffect, useState } from "react";
import { useTranslations } from "use-intl";
import { setKidPersona } from "@dodi/client-state/kid-profile";
import { loadPersonas } from "@dodi/client-state/personas";
import type { Persona } from "@dodi/types/database";

import { api } from "@/adapters/platform";
import { Select } from "@/components/ui";
import { useVaultStore } from "@/lib/client-state";
import { parentFlowDeps } from "@/lib/parent-flow-deps";

/** The web's "Use default" option (no persona; persona ids are uuids). */
const DEFAULT_VALUE = "__default";

/**
 * The kid's active persona (web: parent/persona-selector). Saves on change
 * and mirrors the pick into the cached kid rows, which embed the persona.
 */
export function PersonaSelector({
  kidId,
  value,
  onChange,
}: {
  kidId: string;
  value: string | null;
  onChange: (personaId: string | null) => void;
}) {
  const t = useTranslations("personas");
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const session = useVaultStore((s) => s.session);

  useEffect(() => {
    if (!session) return;
    // Account personas are encrypted; names decrypted for the option labels.
    void loadPersonas(api, session).then((list) => {
      setPersonas(list);
      setIsLoading(false);
    });
  }, [session]);

  if (isLoading) return null;

  const options = [
    { value: DEFAULT_VALUE, label: t("useDefault") },
    ...personas.map((p) => ({
      value: p.id,
      label: p.is_system_default ? `${p.name} (${t("default")})` : p.name,
    })),
  ];

  return (
    <Select
      value={value ?? DEFAULT_VALUE}
      options={options}
      label={t("selectorLabel")}
      onValueChange={(picked) => {
        const next = picked === DEFAULT_VALUE ? null : picked;
        onChange(next);
        void setKidPersona(parentFlowDeps(), kidId, next, personas);
      }}
    />
  );
}

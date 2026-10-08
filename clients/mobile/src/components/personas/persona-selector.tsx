import { useTranslations } from "use-intl";
import type { Persona } from "@dodi/types/database";

import { Select } from "@/components/ui";

/** The web's empty option: no persona, the default soul (persona ids are uuids). */
const DEFAULT_VALUE = "__default";

/** Picks a companion's persona (web: parent/persona-selector; "Use default" = no persona). */
export function PersonaSelector({
  personas,
  value,
  onChange,
  disabled,
}: {
  personas: Persona[];
  value: string | null;
  onChange: (personaId: string | null) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("personas");
  const options = [
    { value: DEFAULT_VALUE, label: t("useDefault") },
    ...personas.filter((p) => !p.is_system_default).map((p) => ({ value: p.id, label: p.name })),
  ];
  return (
    <Select
      value={value ?? DEFAULT_VALUE}
      options={options}
      label={t("selectorLabel")}
      disabled={disabled}
      onValueChange={(picked) => onChange(picked === DEFAULT_VALUE ? null : picked)}
    />
  );
}

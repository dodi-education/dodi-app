import { useTranslations } from "use-intl";
import { KID_LANGUAGE_OPTIONS } from "@dodi/client-state/kid-profile";

import { Select } from "@/components/ui";

/** The kid's UI language (web: the FieldRow `<select>` of locales). */
export function KidLanguageSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const t = useTranslations("kids");
  return (
    <Select<string>
      value={value}
      options={KID_LANGUAGE_OPTIONS}
      label={t("language")}
      onValueChange={onChange}
    />
  );
}

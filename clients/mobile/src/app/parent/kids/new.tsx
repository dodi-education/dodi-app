import { type Href, useRouter } from "expo-router";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { flowErrorText } from "@dodi/client-state/flow-error";
import { KID_NAME_MAX_LENGTH, createKid, invalidKidFields } from "@dodi/client-state/kid-profile";

import { SectionFormError } from "@/components/parent/form-error";
import { KidLanguageSelect } from "@/components/kids/language-select";
import { DateField } from "@/components/parent/date-field";
import { FieldRow } from "@/components/parent/rows";
import { SaveRow } from "@/components/parent/save-row";
import { Section } from "@/components/parent/section";
import { ShellContent } from "@/components/shared/shell-content";
import { Button, Input } from "@/components/ui";
import { parentFlowDeps } from "@/lib/parent-flow-deps";

/**
 * Add a kid (web: parent/kids/new/page). Name and birthdate are sealed on the
 * device; the friend code is assigned server-side.
 */
export default function NewKidScreen() {
  const t = useTranslations("kids");
  const tc = useTranslations("common");
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [isNameInvalid, setIsNameInvalid] = useState(false);
  const [birthdate, setBirthdate] = useState("");
  const [language, setLanguage] = useState<string>("en");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(): Promise<void> {
    setError(null);
    if (invalidKidFields({ displayName }).name) {
      setIsNameInvalid(true);
      return;
    }
    setIsLoading(true);
    try {
      await createKid(parentFlowDeps(), { displayName, birthdate, language });
    } catch (err) {
      setError(flowErrorText(err, t("failedToCreate")));
      setIsLoading(false);
      return;
    }
    router.replace("/parent/kids" as Href);
  }

  return (
    <ShellContent>
      <Section title={tc("details")}>
        <FieldRow label={t("displayName")} required>
          <Input
            placeholder={t("displayNamePlaceholder")}
            value={displayName}
            onChangeText={(next) => {
              setDisplayName(next);
              if (isNameInvalid) setIsNameInvalid(false);
            }}
            accessibilityLabel={t("displayName")}
            isInvalid={isNameInvalid}
            maxLength={KID_NAME_MAX_LENGTH}
            returnKeyType="done"
            onSubmitEditing={() => void handleSubmit()}
          />
        </FieldRow>
        <FieldRow label={t("birthdateOptional")} hint={t("birthdateHint")}>
          <DateField value={birthdate} onChange={setBirthdate} accessibilityLabel={t("birthdateOptional")} />
        </FieldRow>
        <FieldRow label={t("language")} hint={t("languageHint")}>
          <KidLanguageSelect value={language} onChange={setLanguage} />
        </FieldRow>
        {error ? <SectionFormError>{error}</SectionFormError> : null}
        <SaveRow>
          <Button variant="outline" onPress={() => router.back()}>
            {tc("cancel")}
          </Button>
          <Button disabled={isLoading} onPress={() => void handleSubmit()}>
            {isLoading ? t("creating") : t("addKid")}
          </Button>
        </SaveRow>
      </Section>
    </ShellContent>
  );
}

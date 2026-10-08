import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { COMPANION_NAME_MAX_LENGTH, createCompanion } from "@dodi/client-state/companions";
import { flowErrorText } from "@dodi/client-state/flow-error";

import { SectionFormError } from "@/components/parent/form-error";
import { FieldRow } from "@/components/parent/rows";
import { SaveRow } from "@/components/parent/save-row";
import { Section } from "@/components/parent/section";
import { PersonaSelector } from "@/components/personas/persona-selector";
import { usePersonas } from "@/components/personas/use-personas";
import { ShellContent } from "@/components/shared/shell-content";
import { Button, Input, Select } from "@/components/ui";
import { companionFlowDeps } from "@/lib/companion-flow-deps";
import { useKids } from "@/lib/use-kids";

/**
 * Add a companion to a kid (web: parent/companions/new/page): its name and
 * persona. The name is sealed on the device; `?kid=` preselects the kid.
 */
export default function NewCompanionScreen() {
  const t = useTranslations("companions");
  const tc = useTranslations("common");
  const tp = useTranslations("personas");
  const router = useRouter();
  const params = useLocalSearchParams<{ kid?: string }>();
  const { kids } = useKids();
  const personas = usePersonas();
  const [pickedKidId, setKidId] = useState(params.kid ?? "");
  const kidId = pickedKidId || kids?.[0]?.id || "";
  const [name, setName] = useState("");
  const [personaId, setPersonaId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(): Promise<void> {
    if (!kidId) return;
    setError(null);
    setIsSaving(true);
    try {
      await createCompanion(companionFlowDeps(), kidId, { name, personaId });
    } catch (err) {
      setError(flowErrorText(err, t("failedToCreate")));
      setIsSaving(false);
      return;
    }
    router.replace("/parent/companions" as Href);
  }

  return (
    <ShellContent>
      <Section title={t("createTitle")} desc={t("createDescription")}>
        <FieldRow label={t("kidLabel")} required>
          <Select
            value={kidId || null}
            options={(kids ?? []).map((kid) => ({ value: kid.id, label: kid.display_name }))}
            label={t("kidLabel")}
            onValueChange={setKidId}
          />
        </FieldRow>
        <FieldRow label={t("nameLabel")} hint={t("nameHint")}>
          <Input
            value={name}
            placeholder="dodi"
            onChangeText={setName}
            accessibilityLabel={t("nameLabel")}
            maxLength={COMPANION_NAME_MAX_LENGTH}
          />
        </FieldRow>
        <FieldRow label={tp("selectorLabel")} hint={t("personaHint")}>
          <PersonaSelector personas={personas ?? []} value={personaId} onChange={setPersonaId} disabled={!personas} />
        </FieldRow>
        {error ? <SectionFormError>{error}</SectionFormError> : null}
        <SaveRow>
          <Button variant="outline" onPress={() => router.back()}>
            {tc("cancel")}
          </Button>
          <Button disabled={isSaving || !kidId} onPress={() => void handleSubmit()}>
            {isSaving ? tp("saving") : t("addCompanion")}
          </Button>
        </SaveRow>
      </Section>
    </ShellContent>
  );
}

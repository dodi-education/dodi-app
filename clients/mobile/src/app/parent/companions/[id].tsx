import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslations } from "use-intl";
import {
  COMPANION_NAME_MAX_LENGTH,
  activeCompanionOf,
  companionNameOf,
  deleteCompanion,
  renameCompanion,
  setActiveCompanion,
  setCompanionPersona,
} from "@dodi/client-state/companions";
import { flowErrorText } from "@dodi/client-state/flow-error";

import { SectionFormError } from "@/components/parent/form-error";
import { PageMessage } from "@/components/parent/page-message";
import { FieldRow, Row, RowMain, RowMeta, RowTitle } from "@/components/parent/rows";
import { SaveRow } from "@/components/parent/save-row";
import { Section } from "@/components/parent/section";
import { PersonaSelector } from "@/components/personas/persona-selector";
import { usePersonas } from "@/components/personas/use-personas";
import { ShellContent } from "@/components/shared/shell-content";
import { Button, Dialog, Input, Text } from "@/components/ui";
import { useBreadcrumbStore } from "@/lib/breadcrumb-store";
import { clientState } from "@/lib/client-state";
import { companionFlowDeps } from "@/lib/companion-flow-deps";
import { useKids } from "@/lib/use-kids";

/** How long "Changes saved" stays beside Save. */
const SAVED_NOTE_MS = 2500;

/**
 * One companion (web: parent/companions/[id]/page): rename it (sealed on the
 * device), pick its persona, make it the kid's active one, or delete it (not
 * the last one).
 */
export default function EditCompanionScreen() {
  const t = useTranslations("companions");
  const tc = useTranslations("common");
  const tp = useTranslations("personas");
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { kids } = useKids();
  const personas = usePersonas();
  const kid = kids?.find((k) => k.companions.some((c) => c.id === id)) ?? null;
  const companion = kid?.companions.find((c) => c.id === id) ?? null;
  const isActive = kid !== null && activeCompanionOf(kid)?.id === id;
  const [nameDraft, setName] = useState<string | null>(null);
  const name = nameDraft ?? companion?.name ?? "";
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const setLeaf = useBreadcrumbStore((s) => s.setLeaf);
  useEffect(() => {
    if (companion) setLeaf(companionNameOf(companion));
    return () => setLeaf(null);
  }, [companion, setLeaf]);

  async function run(action: () => Promise<void>, fallback: string): Promise<boolean> {
    setError(null);
    try {
      await action();
      return true;
    } catch (err) {
      setError(flowErrorText(err, fallback));
      return false;
    }
  }

  async function handleRename(): Promise<void> {
    if (!kid) return;
    setIsSaving(true);
    const isOk = await run(() => renameCompanion(companionFlowDeps(), kid.id, id, name), t("failedToUpdate"));
    setIsSaving(false);
    if (!isOk) return;
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), SAVED_NOTE_MS);
  }

  async function handleDelete(): Promise<void> {
    setIsConfirmingDelete(false);
    const isOk = await run(() => deleteCompanion(companionFlowDeps(), id), t("failedToDelete"));
    if (isOk) router.replace("/parent/companions" as Href);
  }

  const refresh = async (): Promise<void> => {
    await clientState.kids.getState().loadList(true);
  };

  if (!kids) return <ShellContent onRefresh={refresh}>{null}</ShellContent>;
  if (!kid || !companion) {
    return (
      <ShellContent onRefresh={refresh}>
        <PageMessage>{t("notFound")}</PageMessage>
      </ShellContent>
    );
  }
  const isLast = kid.companions.length <= 1;

  return (
    <ShellContent onRefresh={refresh}>
      <Section title={t("editTitle")} desc={t("editDescription", { name: kid.display_name })}>
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
          <PersonaSelector
            personas={personas ?? []}
            value={companion.persona_id}
            disabled={!personas}
            onChange={(personaId) =>
              void run(
                () => setCompanionPersona(companionFlowDeps(), kid.id, id, personaId, personas ?? []),
                t("failedToUpdate"),
              )
            }
          />
        </FieldRow>
        <FieldRow label={t("activeLabel")} hint={t("activeHint", { name: kid.display_name })}>
          {isActive ? (
            <Text className="text-sm text-muted-foreground">{t("isActive")}</Text>
          ) : (
            <Button
              variant="outline"
              onPress={() => void run(() => setActiveCompanion(companionFlowDeps(), kid.id, id), t("failedToUpdate"))}
            >
              {t("makeActive")}
            </Button>
          )}
        </FieldRow>
        {error ? <SectionFormError>{error}</SectionFormError> : null}
        <SaveRow note={isSaved ? tc("saved") : undefined}>
          <Button disabled={isSaving} onPress={() => void handleRename()}>
            {isSaving ? tp("saving") : tc("save")}
          </Button>
        </SaveRow>
      </Section>

      <Section title={t("dangerZone")}>
        <Row>
          <RowMain>
            <RowTitle>{t("deleteCompanion")}</RowTitle>
            <RowMeta>{isLast ? t("lastCompanionHint") : t("dangerZoneDescription")}</RowMeta>
          </RowMain>
          <Button variant="destructive" icon="delete" disabled={isLast} onPress={() => setIsConfirmingDelete(true)}>
            {t("deleteCompanion")}
          </Button>
        </Row>
      </Section>

      {/* The web's confirm() as the kit's Dialog. */}
      <Dialog
        isOpen={isConfirmingDelete}
        onClose={() => setIsConfirmingDelete(false)}
        title={t("deleteCompanion")}
        description={t("confirmDelete")}
        footer={
          <>
            <Button variant="destructive" icon="delete" onPress={() => void handleDelete()}>
              {t("deleteCompanion")}
            </Button>
            <Button variant="outline" onPress={() => setIsConfirmingDelete(false)}>
              {tc("cancel")}
            </Button>
          </>
        }
      />
    </ShellContent>
  );
}

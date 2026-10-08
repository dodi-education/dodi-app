"use client";

import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

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
import { pageMessage, sectionFormError } from "@dodi/ui-recipes";

import { PersonaSelector } from "@/components/parent/persona-selector";
import { FieldRow, Row, RowMain, RowMeta, RowTitle } from "@/components/parent/rows";
import { SaveRow } from "@/components/parent/save-row";
import { Section } from "@/components/parent/section";
import { usePersonas } from "@/components/parent/use-personas";
import { Icon } from "@/components/shared/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { companionFlowDeps } from "@/lib/companion-flow-deps";
import { cn } from "@/lib/utils";
import { useBreadcrumbStore } from "@/stores/breadcrumb-store";
import { useKidStore } from "@/stores/kid-store";

export default function EditCompanionPage() {
  const t = useTranslations("companions");
  const tc = useTranslations("common");
  const tp = useTranslations("personas");
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const kids = useKidStore((s) => s.list);
  const loadList = useKidStore((s) => s.loadList);
  const personas = usePersonas();
  const kid = kids?.find((k) => k.companions.some((c) => c.id === params.id)) ?? null;
  const companion = kid?.companions.find((c) => c.id === params.id) ?? null;
  const isActive = kid !== null && activeCompanionOf(kid)?.id === params.id;
  const [nameDraft, setName] = useState<string | null>(null);
  const name = nameDraft ?? companion?.name ?? "";
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    void loadList();
  }, [loadList]);

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

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    if (!kid) return;
    setIsSaving(true);
    const isOk = await run(() => renameCompanion(companionFlowDeps(), kid.id, params.id, name), t("failedToUpdate"));
    setIsSaving(false);
    if (!isOk) return;
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2500);
  }

  async function handleDelete() {
    if (!confirm(t("confirmDelete"))) return;
    const isOk = await run(() => deleteCompanion(companionFlowDeps(), params.id), t("failedToDelete"));
    if (isOk) router.push("/parent/companions");
  }

  if (!kids) return null;
  if (!kid || !companion) {
    return (
      <div className={cn(pageMessage.web, pageMessage.box)}>
        <p className={pageMessage.text}>{t("notFound")}</p>
      </div>
    );
  }
  const isLast = kid.companions.length <= 1;

  return (
    <div>
      <form onSubmit={handleRename}>
        <Section title={t("editTitle")} desc={t("editDescription", { name: kid.display_name })}>
          <FieldRow label={t("nameLabel")} hint={t("nameHint")} htmlFor="companion-name">
            <Input
              id="companion-name"
              className="sm:w-[250px]"
              value={name}
              placeholder="dodi"
              onChange={(e) => setName(e.target.value)}
              maxLength={COMPANION_NAME_MAX_LENGTH}
            />
          </FieldRow>
          <FieldRow label={tp("selectorLabel")} hint={t("personaHint")} htmlFor="persona">
            <PersonaSelector
              personas={personas ?? []}
              value={companion.persona_id}
              disabled={!personas}
              onChange={(personaId) =>
                void run(
                  () => setCompanionPersona(companionFlowDeps(), kid.id, params.id, personaId, personas ?? []),
                  t("failedToUpdate"),
                )
              }
            />
          </FieldRow>
          <FieldRow label={t("activeLabel")} hint={t("activeHint", { name: kid.display_name })}>
            {isActive ? (
              <span className="text-sm text-muted-foreground">{t("isActive")}</span>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => void run(() => setActiveCompanion(companionFlowDeps(), kid.id, params.id), t("failedToUpdate"))}
              >
                {t("makeActive")}
              </Button>
            )}
          </FieldRow>
          {error && <div className={cn(sectionFormError.box, sectionFormError.text)}>{error}</div>}
          <SaveRow note={isSaved ? tc("saved") : undefined}>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? tp("saving") : tc("save")}
            </Button>
          </SaveRow>
        </Section>
      </form>

      <Section title={t("dangerZone")}>
        <Row>
          <RowMain>
            <RowTitle>{t("deleteCompanion")}</RowTitle>
            <RowMeta>{isLast ? t("lastCompanionHint") : t("dangerZoneDescription")}</RowMeta>
          </RowMain>
          <Button variant="destructive" onClick={handleDelete} disabled={isLast}>
            <Icon name="delete" size={14} />
            {t("deleteCompanion")}
          </Button>
        </Row>
      </Section>
    </div>
  );
}

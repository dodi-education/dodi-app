"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useEffect, useState } from "react";

import { COMPANION_NAME_MAX_LENGTH, createCompanion } from "@dodi/client-state/companions";
import { flowErrorText } from "@dodi/client-state/flow-error";
import { sectionFormError } from "@dodi/ui-recipes";

import { PersonaSelector } from "@/components/parent/persona-selector";
import { FieldRow, fieldSelectClass } from "@/components/parent/rows";
import { SaveRow } from "@/components/parent/save-row";
import { Section } from "@/components/parent/section";
import { usePersonas } from "@/components/parent/use-personas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { companionFlowDeps } from "@/lib/companion-flow-deps";
import { cn } from "@/lib/utils";
import { useKidStore } from "@/stores/kid-store";

function NewCompanionContent() {
  const t = useTranslations("companions");
  const tc = useTranslations("common");
  const tp = useTranslations("personas");
  const router = useRouter();
  const searchParams = useSearchParams();
  const kids = useKidStore((s) => s.list);
  const loadList = useKidStore((s) => s.loadList);
  const personas = usePersonas();
  const [pickedKidId, setKidId] = useState(searchParams.get("kid") ?? "");
  const kidId = pickedKidId || kids?.[0]?.id || "";
  const [name, setName] = useState("");
  const [personaId, setPersonaId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
    router.push("/parent/companions");
  }

  return (
    <form onSubmit={handleSubmit}>
      <Section title={t("createTitle")} desc={t("createDescription")}>
        <FieldRow label={t("kidLabel")} htmlFor="kid" required>
          <select id="kid" value={kidId} onChange={(e) => setKidId(e.target.value)} className={fieldSelectClass}>
            {(kids ?? []).map((kid) => (
              <option key={kid.id} value={kid.id}>
                {kid.display_name}
              </option>
            ))}
          </select>
        </FieldRow>
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
          <PersonaSelector personas={personas ?? []} value={personaId} onChange={setPersonaId} disabled={!personas} />
        </FieldRow>
        {error && <div className={cn(sectionFormError.box, sectionFormError.text)}>{error}</div>}
        <SaveRow>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            {tc("cancel")}
          </Button>
          <Button type="submit" disabled={isSaving || !kidId}>
            {isSaving ? tp("saving") : t("addCompanion")}
          </Button>
        </SaveRow>
      </Section>
    </form>
  );
}

export default function NewCompanionPage() {
  return (
    <Suspense>
      <NewCompanionContent />
    </Suspense>
  );
}

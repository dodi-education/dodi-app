"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { flowErrorText } from "@dodi/client-state/flow-error";
import {
  KID_LANGUAGE_OPTIONS,
  KID_NAME_MAX_LENGTH,
  createKid,
  invalidKidFields,
} from "@dodi/client-state/kid-profile";
import { DateField } from "@/components/parent/date-field";
import { FieldRow, fieldSelectClass } from "@/components/parent/rows";
import { SaveRow } from "@/components/parent/save-row";
import { Section } from "@/components/parent/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parentFlowDeps } from "@/lib/parent-flow-deps";
import { cn } from "@/lib/utils";
import { sectionFormError } from "@dodi/ui-recipes";

export default function NewKidPage() {
  const t = useTranslations("kids");
  const tc = useTranslations("common");
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [invalidName, setInvalidName] = useState(false);
  const [birthdate, setBirthdate] = useState("");
  const [language, setLanguage] = useState<string>("en");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (invalidKidFields({ displayName }).name) {
      setInvalidName(true);
      return;
    }
    setLoading(true);

    // Personal fields are sealed on the device. social_id (the public friend
    // handle) is assigned randomly server-side and the parent manages it on the kid.
    try {
      await createKid(parentFlowDeps(), { displayName, birthdate, language });
    } catch (err) {
      setError(flowErrorText(err, t("failedToCreate")));
      setLoading(false);
      return;
    }

    router.push("/parent/kids");
    router.refresh();
  }

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <Section title={tc("details")}>
          <FieldRow label={t("displayName")} htmlFor="display-name" required>
            <Input
              id="display-name"
              className="sm:w-[250px]"
              placeholder={t("displayNamePlaceholder")}
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                if (invalidName) setInvalidName(false);
              }}
              aria-invalid={invalidName || undefined}
              aria-required
              maxLength={KID_NAME_MAX_LENGTH}
            />
          </FieldRow>
          <FieldRow
            label={t("birthdateOptional")}
            hint={t("birthdateHint")}
            htmlFor="birthdate"
          >
            <DateField
              id="birthdate"
              className="sm:w-[250px]"
              value={birthdate}
              onChange={setBirthdate}
            />
          </FieldRow>
          <FieldRow
            label={t("language")}
            hint={t("languageHint")}
            htmlFor="language"
          >
            <select
              id="language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className={fieldSelectClass}
            >
              {KID_LANGUAGE_OPTIONS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </FieldRow>
          {error && (
            <div className={cn(sectionFormError.box, sectionFormError.text)}>{error}</div>
          )}
          <SaveRow>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
            >
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? t("creating") : t("addKid")}
            </Button>
          </SaveRow>
        </Section>
      </form>
    </div>
  );
}

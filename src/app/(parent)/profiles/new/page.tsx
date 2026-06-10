"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { BackLink } from "@/components/parent/back-link";
import { FieldRow } from "@/components/parent/rows";
import { SaveRow } from "@/components/parent/save-row";
import { PageHead, Section } from "@/components/parent/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { locales, type Locale } from "@/i18n/config";

const localeNames: Record<Locale, string> = {
  en: "English",
  de: "Deutsch",
};

const selectClassName =
  "h-9 w-full rounded-md border border-input bg-card px-3 text-sm outline-none transition-[color,box-shadow,border-color] hover:border-faint focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary-soft-2 sm:w-[250px]";

export default function NewProfilePage() {
  const t = useTranslations("profiles");
  const tc = useTranslations("common");
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [nameTag, setNameTag] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [language, setLanguage] = useState<string>("en");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function generateNameTag(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 30);
  }

  function handleNameChange(value: string) {
    setDisplayName(value);
    if (!nameTag || nameTag === generateNameTag(displayName)) {
      setNameTag(generateNameTag(value));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const response = await fetch("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        display_name: displayName,
        name_tag: nameTag,
        birthdate: birthdate || undefined,
        language,
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      setError(data.error || t("failedToCreate"));
      setLoading(false);
      return;
    }

    router.push("/profiles");
    router.refresh();
  }

  return (
    <div>
      <BackLink href="/profiles">{t("title")}</BackLink>
      <PageHead title={t("createTitle")} sub={t("createDescription")} />

      <form onSubmit={handleSubmit}>
        <Section>
          <FieldRow label={t("displayName")} htmlFor="display-name">
            <Input
              id="display-name"
              className="sm:w-[250px]"
              placeholder={t("displayNamePlaceholder")}
              value={displayName}
              onChange={(e) => handleNameChange(e.target.value)}
              required
              maxLength={50}
            />
          </FieldRow>
          <FieldRow
            label={t("nameTag")}
            hint={t("nameTagHint")}
            htmlFor="name-tag"
          >
            <Input
              id="name-tag"
              className="sm:w-[250px]"
              placeholder={t("nameTagPlaceholder")}
              value={nameTag}
              onChange={(e) => setNameTag(e.target.value)}
              required
              maxLength={30}
              pattern="[a-z0-9-]+"
            />
          </FieldRow>
          <FieldRow
            label={t("birthdateOptional")}
            hint={t("birthdateHint")}
            htmlFor="birthdate"
          >
            <Input
              id="birthdate"
              className="sm:w-[250px]"
              type="date"
              value={birthdate}
              onChange={(e) => setBirthdate(e.target.value)}
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
              className={selectClassName}
            >
              {locales.map((l) => (
                <option key={l} value={l}>
                  {localeNames[l]}
                </option>
              ))}
            </select>
          </FieldRow>
          {error && (
            <div className="px-5 py-3 text-sm text-danger">{error}</div>
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
              {loading ? t("creating") : t("createProfile")}
            </Button>
          </SaveRow>
        </Section>
      </form>
    </div>
  );
}

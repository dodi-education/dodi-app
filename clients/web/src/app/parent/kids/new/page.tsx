"use client";

import { dodi } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { DateField } from "@/components/parent/date-field";
import { FieldRow } from "@/components/parent/rows";
import { SaveRow } from "@/components/parent/save-row";
import { PageHead, Section } from "@/components/parent/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { locales, type Locale } from "@/i18n/config";
import { encryptKidFields } from "@dodi/vault";
import { useKidStore } from "@/stores/kid-store";
import { useVaultStore } from "@/stores/vault-store";

const localeNames: Record<Locale, string> = {
  en: "English",
  de: "Deutsch",
};

const selectClassName =
  "h-9 w-full rounded-md border border-input bg-card px-3 text-sm outline-none transition-[color,box-shadow,border-color] hover:border-faint focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary-soft-2 sm:w-[250px]";

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
    if (!displayName.trim()) {
      setInvalidName(true);
      return;
    }
    setLoading(true);

    const session = useVaultStore.getState().session;
    if (!session) {
      setError("Your secure vault is locked. Please reload and try again.");
      setLoading(false);
      return;
    }

    // Encrypt personal fields client-side. social_id (the public friend handle)
    // is assigned randomly server-side and the parent manages it on the kid.
    const enc = encryptKidFields(session, {
      display_name: displayName,
      ...(birthdate ? { birthdate } : {}),
    });

    const response = await dodi.request("/api/kids", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        display_name: enc.display_name,
        birthdate: enc.birthdate,
        language,
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      setError(data.error || t("failedToCreate"));
      setLoading(false);
      return;
    }

    useKidStore.getState().invalidate();
    router.push("/parent/kids");
    router.refresh();
  }

  return (
    <div>
      <PageHead title={t("createTitle")} sub={t("createDescription")} />

      <form onSubmit={handleSubmit}>
        <Section>
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
              maxLength={50}
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
              {loading ? t("creating") : t("addKid")}
            </Button>
          </SaveRow>
        </Section>
      </form>
    </div>
  );
}

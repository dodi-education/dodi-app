"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { locales, type Locale } from "@/i18n/config";

const localeNames: Record<Locale, string> = {
  en: "English",
  de: "Deutsch",
};

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
    <div className="mx-auto max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle>{t("createTitle")}</CardTitle>
          <CardDescription>
            {t("createDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="display-name">{t("displayName")}</Label>
              <Input
                id="display-name"
                placeholder={t("displayNamePlaceholder")}
                value={displayName}
                onChange={(e) => handleNameChange(e.target.value)}
                required
                maxLength={50}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="name-tag">{t("nameTag")}</Label>
              <Input
                id="name-tag"
                placeholder={t("nameTagPlaceholder")}
                value={nameTag}
                onChange={(e) => setNameTag(e.target.value)}
                required
                maxLength={30}
                pattern="[a-z0-9-]+"
              />
              <p className="text-xs text-muted-foreground">
                {t("nameTagHint")}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="birthdate">{t("birthdateOptional")}</Label>
              <Input
                id="birthdate"
                type="date"
                value={birthdate}
                onChange={(e) => setBirthdate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t("birthdateHint")}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="language">{t("language")}</Label>
              <select
                id="language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {locales.map((l) => (
                  <option key={l} value={l}>
                    {localeNames[l]}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                {t("languageHint")}
              </p>
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={loading}>
                {loading ? t("creating") : t("createProfile")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                {tc("cancel")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

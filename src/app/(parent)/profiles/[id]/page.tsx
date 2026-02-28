"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
import { Separator } from "@/components/ui/separator";
import { PersonaSelector } from "@/components/parent/persona-selector";
import { locales, type Locale } from "@/i18n/config";

import type { Profile } from "@/types/database";

const localeNames: Record<Locale, string> = {
  en: "English",
  de: "Deutsch",
};

export default function EditProfilePage() {
  const t = useTranslations("profiles");
  const tc = useTranslations("common");
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [nameTag, setNameTag] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [language, setLanguage] = useState<string>("en");
  const [activePersonaId, setActivePersonaId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const response = await fetch(`/api/profiles/${params.id}`);
      if (cancelled) return;
      if (!response.ok) {
        setError(t("profileNotFound"));
        setFetching(false);
        return;
      }
      const data: Profile = await response.json();
      if (cancelled) return;
      setProfile(data);
      setDisplayName(data.display_name);
      setNameTag(data.name_tag);
      setBirthdate(data.birthdate ?? "");
      setLanguage(data.language ?? "en");
      setActivePersonaId(data.active_persona_id);
      setFetching(false);
    }
    load();
    return () => { cancelled = true; };
  }, [params.id, t]);

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const response = await fetch(`/api/profiles/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        display_name: displayName,
        name_tag: nameTag,
        birthdate: birthdate || null,
        language,
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      setError(data.error || t("failedToUpdate"));
      setLoading(false);
      return;
    }

    router.push("/profiles");
    router.refresh();
  }

  async function handleDelete() {
    if (!confirm(t("confirmDelete"))) {
      return;
    }

    const response = await fetch(`/api/profiles/${params.id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      setError(t("failedToDelete"));
      return;
    }

    router.push("/profiles");
    router.refresh();
  }

  if (fetching) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">{t("loadingProfile")}</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">{t("profileNotFound")}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("editTitle")}</CardTitle>
          <CardDescription>
            {t("editDescription", { name: profile.display_name })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpdate} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="display-name">{t("displayName")}</Label>
              <Input
                id="display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                maxLength={50}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="name-tag">{t("nameTag")}</Label>
              <Input
                id="name-tag"
                value={nameTag}
                onChange={(e) => setNameTag(e.target.value)}
                required
                maxLength={30}
                pattern="[a-z0-9-]+"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="birthdate">{t("birthdate")}</Label>
              <Input
                id="birthdate"
                type="date"
                value={birthdate}
                onChange={(e) => setBirthdate(e.target.value)}
              />
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
            <PersonaSelector
              profileId={params.id}
              value={activePersonaId}
              onChange={setActivePersonaId}
            />
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={loading}>
                {loading ? t("saving") : tc("save")}
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

      <Card>
        <CardHeader>
          <CardTitle>{t("memoryTitle")}</CardTitle>
          <CardDescription>{t("memoryDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={() => router.push(`/profiles/${params.id}/memory`)}
          >
            {t("viewMemory")}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">{t("dangerZone")}</CardTitle>
          <CardDescription>
            {t("dangerZoneDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Separator className="mb-4" />
          <Button variant="destructive" onClick={handleDelete}>
            {t("deleteProfile")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

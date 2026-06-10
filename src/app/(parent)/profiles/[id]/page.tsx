"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { BackLink } from "@/components/parent/back-link";
import {
  FieldRow,
  Row,
  RowMain,
  RowMeta,
  RowTitle,
} from "@/components/parent/rows";
import { SaveRow } from "@/components/parent/save-row";
import { PageHead, Section } from "@/components/parent/section";
import { Icon } from "@/components/shared/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PersonaSelector } from "@/components/parent/persona-selector";
import { locales, type Locale } from "@/i18n/config";

import type { Profile } from "@/types/database";

const localeNames: Record<Locale, string> = {
  en: "English",
  de: "Deutsch",
};

const selectClassName =
  "h-9 w-full rounded-md border border-input bg-card px-3 text-sm outline-none transition-[color,box-shadow,border-color] hover:border-faint focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary-soft-2 sm:w-[250px]";

export default function EditProfilePage() {
  const t = useTranslations("profiles");
  const tc = useTranslations("common");
  const tp = useTranslations("personas");
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
    <div>
      <BackLink href="/profiles">{t("title")}</BackLink>
      <PageHead
        title={profile.display_name}
        sub={t("editDescription", { name: profile.display_name })}
      />

      <form onSubmit={handleUpdate}>
        <Section title={t("editTitle")}>
          <FieldRow label={t("displayName")} htmlFor="display-name">
            <Input
              id="display-name"
              className="sm:w-[250px]"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
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
              value={nameTag}
              onChange={(e) => setNameTag(e.target.value)}
              required
              maxLength={30}
              pattern="[a-z0-9-]+"
            />
          </FieldRow>
          <FieldRow label={t("birthdate")} htmlFor="birthdate">
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
          <FieldRow
            label={tp("selectorLabel")}
            hint={tp("selectorHint")}
            htmlFor="persona"
          >
            <PersonaSelector
              profileId={params.id}
              value={activePersonaId}
              onChange={setActivePersonaId}
            />
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
              {loading ? t("saving") : tc("save")}
            </Button>
          </SaveRow>
        </Section>
      </form>

      <Section title={t("memoryTitle")} desc={t("memoryDescription")}>
        <Row
          clickable
          className="cursor-pointer"
          onClick={() => router.push(`/profiles/${params.id}/memory`)}
        >
          <RowMain>
            <RowTitle>{t("viewMemory")}</RowTitle>
          </RowMain>
          <Icon name="chevron_right" size={16} className="text-faint" />
        </Row>
      </Section>

      <Section title={t("dangerZone")}>
        <Row>
          <RowMain>
            <RowTitle>{t("deleteProfile")}</RowTitle>
            <RowMeta>{t("dangerZoneDescription")}</RowMeta>
          </RowMain>
          <Button variant="destructive" onClick={handleDelete}>
            <Icon name="delete" size={14} />
            {t("deleteProfile")}
          </Button>
        </Row>
      </Section>
    </div>
  );
}

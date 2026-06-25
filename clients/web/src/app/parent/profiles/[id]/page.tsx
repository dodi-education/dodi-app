"use client";

import { dodi } from "@/lib/api";
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
import { Switch } from "@/components/ui/switch";
import { PersonaSelector } from "@/components/parent/persona-selector";
import { locales, type Locale } from "@/i18n/config";
import { generateSocialId } from "@dodi/crypto/social-id";
import { encryptProfileFields } from "@dodi/vault";
import { useProfileStore } from "@/stores/profile-store";
import { useVaultStore } from "@/stores/vault-store";

import type { Profile } from "@dodi/types/database";

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
  const tf = useTranslations("friends");
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [invalidName, setInvalidName] = useState(false);
  const [socialId, setSocialId] = useState("");
  const [invalidSocialId, setInvalidSocialId] = useState(false);
  const [birthdate, setBirthdate] = useState("");
  const [language, setLanguage] = useState<string>("en");
  const [activePersonaId, setActivePersonaId] = useState<string | null>(null);
  const [canInitiate, setCanInitiate] = useState(false);
  const [canBeAdded, setCanBeAdded] = useState(false);
  const [incomingApproval, setIncomingApproval] = useState(true);
  const [outgoingApproval, setOutgoingApproval] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await useProfileStore.getState().loadOne(params.id);
        if (cancelled) return;
        if (!data) {
          setError(t("profileNotFound"));
          setFetching(false);
          return;
        }
        setProfile(data);
        setDisplayName(data.display_name);
        setSocialId(data.social_id);
        setBirthdate(data.birthdate ?? "");
        setLanguage(data.language ?? "en");
        setActivePersonaId(data.active_persona_id);
        setCanInitiate(data.can_add_friends ?? false);
        setCanBeAdded(data.can_be_added_as_friend ?? false);
        setIncomingApproval(
          data.incoming_friend_requests_require_parent_approval ?? true,
        );
        setOutgoingApproval(
          data.outgoing_friend_requests_require_parent_approval ?? false,
        );
        setFetching(false);
      } catch {
        if (!cancelled) {
          setError(t("profileNotFound"));
          setFetching(false);
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [params.id, t]);

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const nextInvalid = {
      name: !displayName.trim(),
      socialId: !socialId.trim(),
    };
    if (nextInvalid.name || nextInvalid.socialId) {
      setInvalidName(nextInvalid.name);
      setInvalidSocialId(nextInvalid.socialId);
      return;
    }
    setLoading(true);

    const session = useVaultStore.getState().session;
    if (!session) {
      setError("Your secure vault is locked. Please reload and try again.");
      setLoading(false);
      return;
    }

    const enc = encryptProfileFields(session, {
      display_name: displayName,
      birthdate: birthdate || null,
    });

    const response = await dodi.request(`/api/profiles/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        display_name: enc.display_name,
        social_id: socialId,
        birthdate: enc.birthdate,
        language,
        can_add_friends: canInitiate,
        can_be_added_as_friend: canBeAdded,
        incoming_friend_requests_require_parent_approval: incomingApproval,
        outgoing_friend_requests_require_parent_approval: outgoingApproval,
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      setError(data.error || t("failedToUpdate"));
      setLoading(false);
      return;
    }

    useProfileStore.getState().invalidate();
    router.push("/parent/profiles");
    router.refresh();
  }

  async function handleDelete() {
    if (!confirm(t("confirmDelete"))) {
      return;
    }

    const response = await dodi.request(`/api/profiles/${params.id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      setError(t("failedToDelete"));
      return;
    }

    router.push("/parent/profiles");
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
      <BackLink href="/parent/profiles">{t("title")}</BackLink>
      <PageHead
        title={profile.display_name}
        sub={t("editDescription", { name: profile.display_name })}
      />

      <form onSubmit={handleUpdate}>
        <Section title={t("editTitle")}>
          <FieldRow label={t("displayName")} htmlFor="display-name" required>
            <Input
              id="display-name"
              className="sm:w-[250px]"
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
            label={t("socialId")}
            hint={t("socialIdHint")}
            htmlFor="social-id"
            required
          >
            <div className="flex items-center gap-2">
              <Input
                id="social-id"
                className="sm:w-[250px]"
                value={socialId}
                onChange={(e) => {
                  setSocialId(e.target.value);
                  if (invalidSocialId) setInvalidSocialId(false);
                }}
                aria-invalid={invalidSocialId || undefined}
                aria-required
                maxLength={30}
                pattern="[a-z0-9\-]+"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSocialId(generateSocialId());
                  setInvalidSocialId(false);
                }}
              >
                {t("regenerate")}
              </Button>
            </div>
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
          <FieldRow label={tf("canInitiate")} hint={tf("canInitiateHint")}>
            <Switch checked={canInitiate} onCheckedChange={setCanInitiate} />
          </FieldRow>
          <FieldRow label={tf("canBeAdded")} hint={tf("canBeAddedHint")}>
            <Switch checked={canBeAdded} onCheckedChange={setCanBeAdded} />
          </FieldRow>
          <FieldRow
            label={tf("incomingApproval")}
            hint={tf("incomingApprovalHint")}
          >
            <Switch
              checked={incomingApproval}
              onCheckedChange={setIncomingApproval}
            />
          </FieldRow>
          <FieldRow
            label={tf("outgoingApproval")}
            hint={tf("outgoingApprovalHint")}
          >
            <Switch
              checked={outgoingApproval}
              onCheckedChange={setOutgoingApproval}
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
          onClick={() => router.push(`/parent/profiles/${params.id}/memory`)}
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

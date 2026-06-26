"use client";

import { dodi } from "@/lib/api";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { BackLink } from "@/components/parent/back-link";
import { DateTimeFields } from "@/components/parent/date-time-fields";
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
import { AvatarPinPuzzle } from "@/components/kid/avatar-pin-puzzle";
import { PIN_LENGTH } from "@/lib/avatars";
import { locales, type Locale } from "@/i18n/config";
import { readStoredDatePref } from "@/lib/date-prefs";
import { generateSocialId } from "@dodi/crypto/social-id";
import { encryptProfileFields } from "@dodi/vault";
import {
  resolvePref,
  type DateStyleId,
  type StoredDatePreferences,
  type TimeStyleId,
} from "@dodi/intl";
import { refreshFriendCards } from "@/lib/friends";
import { useDatePrefStore } from "@/stores/date-pref-store";
import { useProfileStore } from "@/stores/profile-store";
import { useVaultStore } from "@/stores/vault-store";

import type { Profile } from "@dodi/types/database";

const localeNames: Record<Locale, string> = {
  en: "English",
  de: "Deutsch",
};

type PinSlots = (string | null)[];
const emptyPin = (): PinSlots => Array<string | null>(PIN_LENGTH).fill(null);

/** Parse a decrypted `avatar_pin` (JSON array of 3 ids) into slots, or null. */
function parseStoredPin(raw: string | null): PinSlots | null {
  if (!raw) return null;
  try {
    const arr: unknown = JSON.parse(raw);
    return Array.isArray(arr) && arr.length === PIN_LENGTH
      ? (arr as PinSlots)
      : null;
  } catch {
    return null;
  }
}

const selectClassName =
  "h-9 w-full rounded-md border border-input bg-card px-3 text-sm outline-none transition-[color,box-shadow,border-color] hover:border-faint focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary-soft-2 sm:w-[250px]";

export default function EditProfilePage() {
  const t = useTranslations("profiles");
  const tc = useTranslations("common");
  const tp = useTranslations("personas");
  const tf = useTranslations("friends");
  const ts = useTranslations("settings");
  const locale = useLocale();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const accountStored = useDatePrefStore((s) => s.accountStored);
  const vaultSession = useVaultStore((s) => s.session);
  const loadAccountPref = useDatePrefStore((s) => s.load);
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
  const [pinEnabled, setPinEnabled] = useState(false);
  const [pinSlots, setPinSlots] = useState<PinSlots>(emptyPin);
  const [pinSaving, setPinSaving] = useState(false);
  const [pinSaved, setPinSaved] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  // Per-profile date/time override ("" = inherit the account default).
  const [dpDateStyle, setDpDateStyle] = useState<DateStyleId | "">("");
  const [dpTimeStyle, setDpTimeStyle] = useState<TimeStyleId | "">("");
  const [dpTimeZone, setDpTimeZone] = useState<string>("");
  const [dpSaving, setDpSaving] = useState(false);
  const [dpSaved, setDpSaved] = useState(false);
  const [dpError, setDpError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    void loadAccountPref();
  }, [loadAccountPref]);

  // What a kid sees when inheriting — drives the preview's fallback values.
  const dateBasePref = resolvePref(
    locale,
    "profile",
    readStoredDatePref(accountStored, vaultSession),
  );

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
        const storedPin = parseStoredPin(data.avatar_pin);
        setPinEnabled(storedPin != null);
        setPinSlots(storedPin ?? emptyPin());
        const dp = data.date_preferences as
          | StoredDatePreferences
          | null
          | undefined;
        setDpDateStyle(dp?.dateStyle ?? "");
        setDpTimeStyle(dp?.timeStyle ?? "");
        const sess = useVaultStore.getState().session;
        if (dp?.timeZoneEnc && sess) {
          try {
            setDpTimeZone(sess.decryptField(dp.timeZoneEnc) ?? "");
          } catch {
            setDpTimeZone("");
          }
        } else {
          setDpTimeZone("");
        }
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

    // Re-seal this kid's friend cards so friends see the new name/birthdate.
    // Best-effort: the profile already saved; never block navigation on it.
    if (profile) {
      try {
        await refreshFriendCards(
          { ...profile, display_name: displayName, birthdate: birthdate || null },
          session,
        );
      } catch {
        // ignored — friends pick up the change on the next refresh
      }
    }

    useProfileStore.getState().invalidate();
    router.push("/parent/profiles");
    router.refresh();
  }

  async function handleSavePin() {
    setPinError(null);
    if (pinEnabled && pinSlots.some((s) => s == null)) {
      setPinError(t("pinPuzzleIncomplete"));
      return;
    }
    const session = useVaultStore.getState().session;
    if (!session) {
      setPinError("Your secure vault is locked. Please reload and try again.");
      return;
    }
    setPinSaving(true);
    const enc = encryptProfileFields(session, {
      avatar_pin: pinEnabled ? JSON.stringify(pinSlots) : null,
    });
    const response = await dodi.request(`/api/profiles/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatar_pin: enc.avatar_pin }),
    });
    setPinSaving(false);
    if (!response.ok) {
      setPinError(t("failedToUpdate"));
      return;
    }
    useProfileStore.getState().invalidate();
    setPinSaved(true);
    setTimeout(() => setPinSaved(false), 2500);
  }

  async function handleSaveDatePrefs() {
    setDpError(null);
    setDpSaving(true);

    // Only fields with an explicit value are stored; "" inherits the account.
    const datePreferences: StoredDatePreferences = {};
    if (dpDateStyle) datePreferences.dateStyle = dpDateStyle;
    if (dpTimeStyle) datePreferences.timeStyle = dpTimeStyle;
    if (dpTimeZone) {
      const session = useVaultStore.getState().session;
      if (!session) {
        setDpError("Your secure vault is locked. Please reload and try again.");
        setDpSaving(false);
        return;
      }
      datePreferences.timeZoneEnc = session.encryptField(dpTimeZone);
    }

    const response = await dodi.request(`/api/profiles/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date_preferences: datePreferences }),
    });
    setDpSaving(false);
    if (!response.ok) {
      setDpError(t("failedToUpdate"));
      return;
    }
    useProfileStore.getState().invalidate();
    setDpSaved(true);
    setTimeout(() => setDpSaved(false), 2500);
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
                  // Codes are canonically uppercase (see generateSocialId); the
                  // kid-side lookup uppercases too, so a lowercase value saved here
                  // would never resolve. Canonicalize as the parent types.
                  setSocialId(e.target.value.toUpperCase());
                  if (invalidSocialId) setInvalidSocialId(false);
                }}
                aria-invalid={invalidSocialId || undefined}
                aria-required
                maxLength={30}
                pattern="[A-Z0-9\-]+"
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

      <Section
        title={t("pinPuzzleTitle")}
        desc={t("pinPuzzleDesc", { name: profile.display_name })}
      >
        <FieldRow
          label={t("pinPuzzleToggle")}
          hint={t("pinPuzzleToggleHint", { name: profile.display_name })}
        >
          <Switch checked={pinEnabled} onCheckedChange={setPinEnabled} />
        </FieldRow>
        {pinEnabled && (
          <div className="px-5 py-4">
            <div className="mb-3 text-[13px] text-muted-foreground">
              {t("pinPuzzleSetHint", { name: profile.display_name })}
            </div>
            <AvatarPinPuzzle
              mode="set"
              value={pinSlots}
              onChange={setPinSlots}
              className="max-w-[320px]"
            />
          </div>
        )}
        {pinError && (
          <div className="px-5 py-3 text-sm text-danger">{pinError}</div>
        )}
        <SaveRow note={pinSaved ? tc("saved") : undefined}>
          <Button type="button" onClick={handleSavePin} disabled={pinSaving}>
            {pinSaving ? t("saving") : tc("save")}
          </Button>
        </SaveRow>
      </Section>

      <Section title={ts("dateTimeTitle")} desc={t("dateTimeOverrideHint")}>
        <DateTimeFields
          dateStyle={dpDateStyle}
          timeStyle={dpTimeStyle}
          timeZone={dpTimeZone}
          onDateStyle={setDpDateStyle}
          onTimeStyle={setDpTimeStyle}
          onTimeZone={setDpTimeZone}
          allowInherit
          allowAuto={false}
          basePref={dateBasePref}
        />
        {dpError && (
          <div className="px-5 py-3 text-sm text-danger">{dpError}</div>
        )}
        <SaveRow note={dpSaved ? tc("saved") : undefined}>
          <Button
            type="button"
            onClick={handleSaveDatePrefs}
            disabled={dpSaving}
          >
            {dpSaving ? t("saving") : tc("save")}
          </Button>
        </SaveRow>
      </Section>

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

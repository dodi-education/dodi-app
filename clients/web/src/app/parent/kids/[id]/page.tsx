"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { DateField } from "@/components/parent/date-field";
import { DateTimeFields } from "@/components/parent/date-time-fields";
import {
  FieldRow,
  fieldSelectClass,
  Row,
  RowMain,
  RowMeta,
  RowTitle,
} from "@/components/parent/rows";
import { SaveRow } from "@/components/parent/save-row";
import { Section } from "@/components/parent/section";
import { Icon } from "@/components/shared/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { PersonaSelector } from "@/components/parent/persona-selector";
import { AvatarPinPuzzle } from "@/components/kid/avatar-pin-puzzle";
import { readStoredDatePref } from "@/lib/date-prefs";
import { generateSocialId } from "@dodi/crypto/social-id";
import {
  resolvePref,
  type DateStyleId,
  type StoredDatePreferences,
  type TimeStyleId,
} from "@dodi/intl";
import { useAccountStore } from "@/stores/account-store";
import { useKidStore } from "@/stores/kid-store";
import { useVaultStore } from "@/stores/vault-store";
import { parentFlowDeps } from "@/lib/parent-flow-deps";
import { cn } from "@/lib/utils";
import {
  pageMessage,
  pinPuzzleBlock,
  sectionFormError,
  socialIdRow,
} from "@dodi/ui-recipes";
import { flowErrorText } from "@dodi/client-state/flow-error";
import {
  KID_LANGUAGE_OPTIONS,
  KID_NAME_MAX_LENGTH,
  SOCIAL_ID_MAX_LENGTH,
  canonicalSocialId,
  deleteKid,
  emptyPinSlots,
  invalidKidFields,
  isPinIncomplete,
  kidDatePrefsFormOf,
  kidProfileFormOf,
  parseStoredPin,
  saveKidDatePreferences,
  saveKidPin,
  updateKidProfile,
  type PinSlots,
} from "@dodi/client-state/kid-profile";

import type { Kid } from "@dodi/types/database";

export default function EditKidPage() {
  const t = useTranslations("kids");
  const tc = useTranslations("common");
  const tp = useTranslations("personas");
  const tf = useTranslations("friends");
  const ts = useTranslations("settings");
  const locale = useLocale();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const accountStored = useAccountStore(
    (s) => (s.account?.date_preferences ?? null) as StoredDatePreferences | null,
  );
  const vaultSession = useVaultStore((s) => s.session);
  const loadAccountPref = useAccountStore((s) => s.load);
  const [kid, setKid] = useState<Kid | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [invalidName, setInvalidName] = useState(false);
  const [socialId, setSocialId] = useState("");
  const [invalidSocialId, setInvalidSocialId] = useState(false);
  const [birthdate, setBirthdate] = useState("");
  const [language, setLanguage] = useState<string>("en");
  const [activePersonaId, setActivePersonaId] = useState<string | null>(null);
  const [canInitiate, setCanInitiate] = useState(true);
  const [canBeAdded, setCanBeAdded] = useState(true);
  const [incomingApproval, setIncomingApproval] = useState(true);
  const [outgoingApproval, setOutgoingApproval] = useState(false);
  const [pinEnabled, setPinEnabled] = useState(false);
  const [pinSlots, setPinSlots] = useState<PinSlots>(emptyPinSlots);
  const [pinSaving, setPinSaving] = useState(false);
  const [pinSaved, setPinSaved] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  // Per-kid date/time override ("" = inherit the account default).
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
    "kid",
    readStoredDatePref(accountStored, vaultSession),
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await useKidStore.getState().loadOne(params.id);
        if (cancelled) return;
        if (!data) {
          setError(t("kidNotFound"));
          setFetching(false);
          return;
        }
        setKid(data);
        const form = kidProfileFormOf(data);
        setDisplayName(form.displayName);
        setSocialId(form.socialId);
        setBirthdate(form.birthdate);
        setLanguage(form.language);
        setActivePersonaId(data.active_persona?.id ?? null);
        setCanInitiate(form.canAddFriends);
        setCanBeAdded(form.canBeAddedAsFriend);
        setIncomingApproval(form.incomingApproval);
        setOutgoingApproval(form.outgoingApproval);
        const storedPin = parseStoredPin(data.avatar_pin);
        setPinEnabled(storedPin != null);
        setPinSlots(storedPin ?? emptyPinSlots());
        const dp = kidDatePrefsFormOf(data, useVaultStore.getState().session);
        setDpDateStyle(dp.dateStyle);
        setDpTimeStyle(dp.timeStyle);
        setDpTimeZone(dp.timeZone);
        setFetching(false);
      } catch {
        if (!cancelled) {
          setError(t("kidNotFound"));
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

    const nextInvalid = invalidKidFields({ displayName, socialId });
    if (nextInvalid.name || nextInvalid.socialId) {
      setInvalidName(nextInvalid.name);
      setInvalidSocialId(nextInvalid.socialId);
      return;
    }
    if (!kid) return;
    setLoading(true);

    // Sealed on the device; afterwards the kid's friend cards are re-sealed
    // so friends see the new name/birthdate (best-effort, never blocks).
    try {
      await updateKidProfile(parentFlowDeps(), kid, {
        displayName,
        socialId,
        birthdate,
        language,
        canAddFriends: canInitiate,
        canBeAddedAsFriend: canBeAdded,
        incomingApproval,
        outgoingApproval,
      });
    } catch (err) {
      setError(flowErrorText(err, t("failedToUpdate")));
      setLoading(false);
      return;
    }

    router.push("/parent/kids");
    router.refresh();
  }

  async function handleSavePin() {
    setPinError(null);
    if (isPinIncomplete(pinEnabled, pinSlots)) {
      setPinError(t("pinPuzzleIncomplete"));
      return;
    }
    setPinSaving(true);
    try {
      await saveKidPin(parentFlowDeps(), params.id, pinEnabled, pinSlots);
    } catch (err) {
      setPinSaving(false);
      setPinError(flowErrorText(err, t("failedToUpdate")));
      return;
    }
    setPinSaving(false);
    setPinSaved(true);
    setTimeout(() => setPinSaved(false), 2500);
  }

  async function handleSaveDatePrefs() {
    setDpError(null);
    setDpSaving(true);
    try {
      // Only fields with an explicit value are stored; "" inherits the account.
      await saveKidDatePreferences(parentFlowDeps(), params.id, {
        dateStyle: dpDateStyle,
        timeStyle: dpTimeStyle,
        timeZone: dpTimeZone,
      });
    } catch (err) {
      setDpSaving(false);
      setDpError(flowErrorText(err, t("failedToUpdate")));
      return;
    }
    setDpSaving(false);
    setDpSaved(true);
    setTimeout(() => setDpSaved(false), 2500);
  }

  async function handleDelete() {
    if (!confirm(t("confirmDelete"))) {
      return;
    }

    try {
      await deleteKid(parentFlowDeps(), params.id);
    } catch {
      setError(t("failedToDelete"));
      return;
    }

    router.push("/parent/kids");
    router.refresh();
  }

  if (fetching) {
    return (
      <div className={cn(pageMessage.web, pageMessage.box)}>
        <p className={pageMessage.text}>{t("loadingKid")}</p>
      </div>
    );
  }

  if (!kid) {
    return (
      <div className={cn(pageMessage.web, pageMessage.box)}>
        <p className={pageMessage.text}>{t("kidNotFound")}</p>
      </div>
    );
  }

  return (
    <div>
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
              maxLength={KID_NAME_MAX_LENGTH}
            />
          </FieldRow>
          <FieldRow
            label={t("socialId")}
            hint={t("socialIdHint")}
            htmlFor="social-id"
            required
          >
            <div className={cn(socialIdRow.web, socialIdRow.box)}>
              <Input
                id="social-id"
                className="sm:w-[250px]"
                value={socialId}
                onChange={(e) => {
                  // Codes are canonically uppercase (see generateSocialId); the
                  // kid-side lookup uppercases too, so a lowercase value saved here
                  // would never resolve. Canonicalize as the parent types.
                  setSocialId(canonicalSocialId(e.target.value));
                  if (invalidSocialId) setInvalidSocialId(false);
                }}
                aria-invalid={invalidSocialId || undefined}
                aria-required
                maxLength={SOCIAL_ID_MAX_LENGTH}
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
          <FieldRow
            label={tp("selectorLabel")}
            hint={tp("selectorHint")}
            htmlFor="persona"
          >
            <PersonaSelector
              kidId={params.id}
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
              {loading ? t("saving") : tc("save")}
            </Button>
          </SaveRow>
        </Section>
      </form>

      <Section title={t("pinPuzzleTitle")}>
        <FieldRow
          label={t("pinPuzzleToggle")}
          hint={t("pinPuzzleToggleHint", { name: kid.display_name })}
        >
          <Switch checked={pinEnabled} onCheckedChange={setPinEnabled} />
        </FieldRow>
        {pinEnabled && (
          <div className={pinPuzzleBlock.box}>
            <div className={pinPuzzleBlock.hint}>
              {t("pinPuzzleSetHint", { name: kid.display_name })}
            </div>
            <AvatarPinPuzzle
              mode="set"
              value={pinSlots}
              onChange={setPinSlots}
              className={pinPuzzleBlock.puzzle}
            />
          </div>
        )}
        {pinError && (
          <div className={cn(sectionFormError.box, sectionFormError.text)}>{pinError}</div>
        )}
        <SaveRow note={pinSaved ? tc("saved") : undefined}>
          <Button type="button" onClick={handleSavePin} disabled={pinSaving}>
            {pinSaving ? t("saving") : tc("save")}
          </Button>
        </SaveRow>
      </Section>

      <Section title={ts("dateTimeTitle")}>
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
          <div className={cn(sectionFormError.box, sectionFormError.text)}>{dpError}</div>
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

      <Section title={t("dangerZone")}>
        <Row>
          <RowMain>
            <RowTitle>{t("deleteKid")}</RowTitle>
            <RowMeta>{t("dangerZoneDescription")}</RowMeta>
          </RowMain>
          <Button variant="destructive" onClick={handleDelete}>
            <Icon name="delete" size={14} />
            {t("deleteKid")}
          </Button>
        </Row>
      </Section>
    </div>
  );
}

import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";
import { generateSocialId } from "@dodi/crypto/social-id";
import { readStoredDatePref } from "@dodi/client-state/date-preferences";
import { activeCompanionOf, companionNameOf } from "@dodi/client-state/companions";
import { flowErrorText } from "@dodi/client-state/flow-error";
import { settleAll } from "@dodi/client-state/pull-refresh";
import {
  KID_NAME_MAX_LENGTH,
  SOCIAL_ID_MAX_LENGTH,
  type PinSlots,
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
} from "@dodi/client-state/kid-profile";
import { type DateStyleId, resolvePref, type StoredDatePreferences, type TimeStyleId } from "@dodi/intl/prefs";
import type { Kid } from "@dodi/types/database";
import { button, buttonIconColor, pinPuzzleBlock, socialIdRow } from "@dodi/ui-recipes";

import { AvatarPinPuzzle } from "@/components/kid/avatar-pin-puzzle";
import { SectionFormError } from "@/components/parent/form-error";
import { KidLanguageSelect } from "@/components/kids/language-select";
import { PageMessage } from "@/components/parent/page-message";
import { DateField } from "@/components/parent/date-field";
import { DateTimeFields } from "@/components/parent/date-time-fields";
import { FieldRow, Row, RowMain, RowMeta, RowTitle } from "@/components/parent/rows";
import { SaveRow } from "@/components/parent/save-row";
import { Section } from "@/components/parent/section";
import { ShellContent } from "@/components/shared/shell-content";
import { Button, Dialog, Icon, Input, Switch, Text } from "@/components/ui";
import { useAccountStore, useKidStore, useVaultStore } from "@/lib/client-state";
import { cn } from "@/lib/cn";
import { useLocaleSetting } from "@/lib/intl";
import { parentFlowDeps } from "@/lib/parent-flow-deps";

/** How long "Changes saved" stays beside a section's Save. */
const SAVED_NOTE_MS = 2500;

/**
 * Edit a kid (web: parent/kids/[id]/page): profile and friend settings, the
 * companions link, the avatar-PIN puzzle, the per-kid date/time override and the
 * danger zone. Personal fields are sealed on the device; a profile save
 * re-seals the kid's friend cards.
 */
export default function EditKidScreen() {
  const t = useTranslations("kids");
  const tc = useTranslations("common");
  const tco = useTranslations("companions");
  const tf = useTranslations("friends");
  const ts = useTranslations("settings");
  const { locale } = useLocaleSetting();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const accountStored = useAccountStore(
    (s) => (s.account?.date_preferences ?? null) as StoredDatePreferences | null,
  );
  const vaultSession = useVaultStore((s) => s.session);
  const loadAccountPref = useAccountStore((s) => s.load);

  const [kid, setKid] = useState<Kid | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [isNameInvalid, setIsNameInvalid] = useState(false);
  const [socialId, setSocialId] = useState("");
  const [isSocialIdInvalid, setIsSocialIdInvalid] = useState(false);
  const [birthdate, setBirthdate] = useState("");
  const [language, setLanguage] = useState<string>("en");
  const [canInitiate, setCanInitiate] = useState(true);
  const [canBeAdded, setCanBeAdded] = useState(true);
  const [incomingApproval, setIncomingApproval] = useState(true);
  const [outgoingApproval, setOutgoingApproval] = useState(false);
  const [canChangeAvatar, setCanChangeAvatar] = useState(false);
  const [isPinEnabled, setIsPinEnabled] = useState(false);
  const [pinSlots, setPinSlots] = useState<PinSlots>(emptyPinSlots);
  const [isPinSaving, setIsPinSaving] = useState(false);
  const [isPinSaved, setIsPinSaved] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  // Per-kid date/time override ("" = inherit the account default).
  const [dpDateStyle, setDpDateStyle] = useState<DateStyleId | "">("");
  const [dpTimeStyle, setDpTimeStyle] = useState<TimeStyleId | "">("");
  const [dpTimeZone, setDpTimeZone] = useState<string>("");
  const [isDpSaving, setIsDpSaving] = useState(false);
  const [isDpSaved, setIsDpSaved] = useState(false);
  const [dpError, setDpError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  useEffect(() => {
    void loadAccountPref();
  }, [loadAccountPref]);

  // What a kid sees when inheriting: drives the preview's fallback values.
  const dateBasePref = resolvePref(locale, "kid", readStoredDatePref(accountStored, vaultSession));

  // Seeds the form from a (decrypted) kid.
  const applyKid = useCallback((data: Kid) => {
    setKid(data);
    const form = kidProfileFormOf(data);
    setDisplayName(form.displayName);
    setSocialId(form.socialId);
    setBirthdate(form.birthdate);
    setLanguage(form.language);
    setCanInitiate(form.canAddFriends);
    setCanBeAdded(form.canBeAddedAsFriend);
    setIncomingApproval(form.incomingApproval);
    setOutgoingApproval(form.outgoingApproval);
    setCanChangeAvatar(form.canChangeCompanionAvatar);
    const storedPin = parseStoredPin(data.avatar_pin);
    setIsPinEnabled(storedPin != null);
    setPinSlots(storedPin ?? emptyPinSlots());
    const dp = kidDatePrefsFormOf(data, useVaultStore.getState().session);
    setDpDateStyle(dp.dateStyle);
    setDpTimeStyle(dp.timeStyle);
    setDpTimeZone(dp.timeZone);
  }, []);

  useEffect(() => {
    let isCancelled = false;
    async function load(): Promise<void> {
      try {
        const data = await useKidStore.getState().loadOne(id);
        if (isCancelled) return;
        if (!data) {
          setError(t("kidNotFound"));
          setIsFetching(false);
          return;
        }
        applyKid(data);
        setIsFetching(false);
      } catch {
        if (!isCancelled) {
          setError(t("kidNotFound"));
          setIsFetching(false);
        }
      }
    }
    void load();
    return () => {
      isCancelled = true;
    };
  }, [id, t, applyKid]);

  // Pull to refresh: the kid past the cache, re-seeding the form as a browser
  // reload would (unsaved edits go), and the account's date defaults.
  const refresh = (): Promise<void> =>
    settleAll([
      () => loadAccountPref(true),
      async () => {
        const data = await useKidStore.getState().loadOne(id, true);
        if (!data) return;
        applyKid(data);
        setError(null);
        setIsFetching(false);
      },
    ]);

  async function handleUpdate(): Promise<void> {
    setError(null);
    const nextInvalid = invalidKidFields({ displayName, socialId });
    if (nextInvalid.name || nextInvalid.socialId) {
      setIsNameInvalid(nextInvalid.name);
      setIsSocialIdInvalid(nextInvalid.socialId);
      return;
    }
    if (!kid) return;
    setIsLoading(true);
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
        canChangeCompanionAvatar: canChangeAvatar,
      });
    } catch (err) {
      setError(flowErrorText(err, t("failedToUpdate")));
      setIsLoading(false);
      return;
    }
    router.replace("/parent/kids" as Href);
  }

  async function handleSavePin(): Promise<void> {
    setPinError(null);
    if (isPinIncomplete(isPinEnabled, pinSlots)) {
      setPinError(t("pinPuzzleIncomplete"));
      return;
    }
    setIsPinSaving(true);
    try {
      await saveKidPin(parentFlowDeps(), id, isPinEnabled, pinSlots);
    } catch (err) {
      setIsPinSaving(false);
      setPinError(flowErrorText(err, t("failedToUpdate")));
      return;
    }
    setIsPinSaving(false);
    setIsPinSaved(true);
    setTimeout(() => setIsPinSaved(false), SAVED_NOTE_MS);
  }

  async function handleSaveDatePrefs(): Promise<void> {
    setDpError(null);
    setIsDpSaving(true);
    try {
      await saveKidDatePreferences(parentFlowDeps(), id, {
        dateStyle: dpDateStyle,
        timeStyle: dpTimeStyle,
        timeZone: dpTimeZone,
      });
    } catch (err) {
      setIsDpSaving(false);
      setDpError(flowErrorText(err, t("failedToUpdate")));
      return;
    }
    setIsDpSaving(false);
    setIsDpSaved(true);
    setTimeout(() => setIsDpSaved(false), SAVED_NOTE_MS);
  }

  async function handleDelete(): Promise<void> {
    setIsConfirmingDelete(false);
    try {
      await deleteKid(parentFlowDeps(), id);
    } catch {
      setError(t("failedToDelete"));
      return;
    }
    router.replace("/parent/kids" as Href);
  }

  if (isFetching) {
    return (
      <ShellContent onRefresh={refresh}>
        <PageMessage>{t("loadingKid")}</PageMessage>
      </ShellContent>
    );
  }

  if (!kid) {
    return (
      <ShellContent onRefresh={refresh}>
        <PageMessage>{t("kidNotFound")}</PageMessage>
      </ShellContent>
    );
  }

  return (
    <ShellContent onRefresh={refresh}>
      <Section title={t("editTitle")}>
        <FieldRow label={t("displayName")} required>
          <Input
            value={displayName}
            onChangeText={(next) => {
              setDisplayName(next);
              if (isNameInvalid) setIsNameInvalid(false);
            }}
            accessibilityLabel={t("displayName")}
            isInvalid={isNameInvalid}
            maxLength={KID_NAME_MAX_LENGTH}
          />
        </FieldRow>
        <FieldRow label={t("socialId")} hint={t("socialIdHint")} required>
          <View className={cn(socialIdRow.box, socialIdRow.fill)}>
            <Input
              className={socialIdRow.fill}
              value={socialId}
              onChangeText={(next) => {
                // Codes are canonically uppercase; canonicalize as the parent types.
                setSocialId(canonicalSocialId(next));
                if (isSocialIdInvalid) setIsSocialIdInvalid(false);
              }}
              accessibilityLabel={t("socialId")}
              isInvalid={isSocialIdInvalid}
              maxLength={SOCIAL_ID_MAX_LENGTH}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <Button
              variant="outline"
              onPress={() => {
                setSocialId(generateSocialId());
                setIsSocialIdInvalid(false);
              }}
            >
              {t("regenerate")}
            </Button>
          </View>
        </FieldRow>
        <FieldRow label={t("birthdate")}>
          <DateField value={birthdate} onChange={setBirthdate} accessibilityLabel={t("birthdate")} />
        </FieldRow>
        <FieldRow label={t("language")} hint={t("languageHint")}>
          <KidLanguageSelect value={language} onChange={setLanguage} />
        </FieldRow>
        <FieldRow label={tco("kidRowLabel")} hint={tco("kidRowHint")}>
          <Button variant="outline" onPress={() => router.push("/parent/companions" as Href)}>
            <Text className={button.text({ variant: "outline" })} numberOfLines={1}>
              {`${companionNameOf(activeCompanionOf(kid))}${kid.companions.length > 1 ? ` +${kid.companions.length - 1}` : ""}`}
            </Text>
            <Icon name="chevron_right" size={14} color={buttonIconColor.outline} />
          </Button>
        </FieldRow>
        <FieldRow label={tco("canChangeAvatar")} hint={tco("canChangeAvatarHint")}>
          <Switch
            checked={canChangeAvatar}
            onCheckedChange={setCanChangeAvatar}
            accessibilityLabel={tco("canChangeAvatar")}
          />
        </FieldRow>
        <FieldRow label={tf("canInitiate")} hint={tf("canInitiateHint")}>
          <Switch checked={canInitiate} onCheckedChange={setCanInitiate} accessibilityLabel={tf("canInitiate")} />
        </FieldRow>
        <FieldRow label={tf("canBeAdded")} hint={tf("canBeAddedHint")}>
          <Switch checked={canBeAdded} onCheckedChange={setCanBeAdded} accessibilityLabel={tf("canBeAdded")} />
        </FieldRow>
        <FieldRow label={tf("incomingApproval")} hint={tf("incomingApprovalHint")}>
          <Switch
            checked={incomingApproval}
            onCheckedChange={setIncomingApproval}
            accessibilityLabel={tf("incomingApproval")}
          />
        </FieldRow>
        <FieldRow label={tf("outgoingApproval")} hint={tf("outgoingApprovalHint")}>
          <Switch
            checked={outgoingApproval}
            onCheckedChange={setOutgoingApproval}
            accessibilityLabel={tf("outgoingApproval")}
          />
        </FieldRow>
        {error ? <SectionFormError>{error}</SectionFormError> : null}
        <SaveRow>
          <Button variant="outline" onPress={() => router.back()}>
            {tc("cancel")}
          </Button>
          <Button disabled={isLoading} onPress={() => void handleUpdate()}>
            {isLoading ? t("saving") : tc("save")}
          </Button>
        </SaveRow>
      </Section>

      <Section title={t("pinPuzzleTitle")}>
        <FieldRow label={t("pinPuzzleToggle")} hint={t("pinPuzzleToggleHint", { name: kid.display_name })}>
          <Switch checked={isPinEnabled} onCheckedChange={setIsPinEnabled} accessibilityLabel={t("pinPuzzleToggle")} />
        </FieldRow>
        {isPinEnabled ? (
          <View className={pinPuzzleBlock.box}>
            <Text className={pinPuzzleBlock.hint}>{t("pinPuzzleSetHint", { name: kid.display_name })}</Text>
            <View className={pinPuzzleBlock.puzzle}>
              <AvatarPinPuzzle mode="set" value={pinSlots} onChange={setPinSlots} />
            </View>
          </View>
        ) : null}
        {pinError ? <SectionFormError>{pinError}</SectionFormError> : null}
        <SaveRow note={isPinSaved ? tc("saved") : undefined}>
          <Button disabled={isPinSaving} onPress={() => void handleSavePin()}>
            {isPinSaving ? t("saving") : tc("save")}
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
        {dpError ? <SectionFormError>{dpError}</SectionFormError> : null}
        <SaveRow note={isDpSaved ? tc("saved") : undefined}>
          <Button disabled={isDpSaving} onPress={() => void handleSaveDatePrefs()}>
            {isDpSaving ? t("saving") : tc("save")}
          </Button>
        </SaveRow>
      </Section>

      <Section title={t("dangerZone")}>
        <Row>
          <RowMain>
            <RowTitle>{t("deleteKid")}</RowTitle>
            <RowMeta>{t("dangerZoneDescription")}</RowMeta>
          </RowMain>
          <Button variant="destructive" icon="delete" onPress={() => setIsConfirmingDelete(true)}>
            {t("deleteKid")}
          </Button>
        </Row>
      </Section>

      {/* The web's confirm() as the kit's Dialog. */}
      <Dialog
        isOpen={isConfirmingDelete}
        onClose={() => setIsConfirmingDelete(false)}
        title={t("deleteKid")}
        description={t("confirmDelete")}
        footer={
          <>
            <Button variant="destructive" icon="delete" onPress={() => void handleDelete()}>
              {t("deleteKid")}
            </Button>
            <Button variant="outline" onPress={() => setIsConfirmingDelete(false)}>
              {tc("cancel")}
            </Button>
          </>
        }
      />
    </ShellContent>
  );
}

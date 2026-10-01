/**
 * Onboarding, right after the account key (web: onboarding): UI language,
 * date/time formats and timezone, all prefilled, so Continue is a
 * confirmation. Everything stays editable in Settings. The timezone is sealed
 * with the VaultSession before it is saved.
 */
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";
import { persistLanguage, saveAccountPreferences } from "@dodi/client-state/onboarding";
import { SUPPORTED_LOCALES, type Locale } from "@dodi/intl/locales";
import { defaultPref, type DateStyleId, type TimeStyleId } from "@dodi/intl/prefs";

import { api } from "@/adapters/platform";
import { DateTimeFields } from "@/components/parent/date-time-fields";
import { Button, Card, Notice, Screen, Text } from "@/components/ui";
import { ChoiceList } from "@/components/ui/choice-list";
import { VaultGate } from "@/components/vault/vault-gate";
import { clientState, useAccountStore } from "@/lib/client-state";
import { useLocaleSetting } from "@/lib/intl";

/** Native language names. */
const LOCALE_NAMES: Record<Locale, string> = { en: "English", de: "Deutsch" };

export default function OnboardingScreen() {
  // Sealing the timezone needs a session; a relaunch here unlocks silently.
  return (
    <VaultGate>
      <PreferencesStep />
    </VaultGate>
  );
}

function PreferencesStep() {
  const t = useTranslations("onboarding");
  const ts = useTranslations("settings");
  const router = useRouter();
  const { locale, setLocale } = useLocaleSetting();
  const loadAccount = useAccountStore((s) => s.load);

  const base = defaultPref(locale, "account");
  const [dateStyle, setDateStyle] = useState<DateStyleId>(base.dateStyle);
  const [timeStyle, setTimeStyle] = useState<TimeStyleId>(base.timeStyle);
  const [timeZone, setTimeZone] = useState("auto");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Warm the account cache so the save can patch it locally.
  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  /** A new language re-seeds the formats with its defaults (German: 24-hour, DD.MM.YYYY). */
  function changeLocale(next: Locale): void {
    if (next === locale) return;
    const nextBase = defaultPref(next, "account");
    setDateStyle(nextBase.dateStyle);
    setTimeStyle(nextBase.timeStyle);
    setLocale(next);
    void persistLanguage({ api, account: clientState.account }, next);
  }

  function finish(): void {
    router.replace("/parent/dashboard");
  }

  async function save(): Promise<void> {
    setError(null);
    setIsSaving(true);
    const failure = await saveAccountPreferences(
      { api, account: clientState.account, vault: clientState.vault },
      { dateStyle, timeStyle, timeZone, language: locale },
    );
    if (failure) {
      setError(failure === "dateVaultLocked" ? ts(failure) : t(failure));
      setIsSaving(false);
      return;
    }
    finish();
  }

  return (
    <Screen isCentered>
      <View className="gap-1">
        <Text variant="title">{t("prefsTitle")}</Text>
        <Text variant="muted">{t("prefsDescription")}</Text>
      </View>
      <Card>
        <ChoiceList
          label={ts("language")}
          choices={SUPPORTED_LOCALES.map((l) => ({ value: l, label: LOCALE_NAMES[l] }))}
          value={locale}
          onChange={changeLocale}
        />
        <DateTimeFields
          dateStyle={dateStyle}
          timeStyle={timeStyle}
          timeZone={timeZone}
          onDateStyle={(v) => setDateStyle((v || base.dateStyle) as DateStyleId)}
          onTimeStyle={(v) => setTimeStyle((v || base.timeStyle) as TimeStyleId)}
          onTimeZone={setTimeZone}
          basePref={base}
        />
      </Card>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Button
        label={isSaving ? t("saving") : t("continue")}
        isLoading={isSaving}
        onPress={() => void save()}
      />
      <Button variant="ghost" label={t("skip")} disabled={isSaving} onPress={finish} />
    </Screen>
  );
}

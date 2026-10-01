/**
 * Account-level "Date & time" settings (web: parent/date-time-settings): the
 * family default for how dates render. Styles are saved plaintext; an
 * explicit timezone is sealed with the VaultSession.
 */
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";
import { initialDateSettings, saveDateSettings } from "@dodi/client-state/date-preferences";
import {
  defaultPref,
  type DateStyleId,
  type StoredDatePreferences,
  type TimeStyleId,
} from "@dodi/intl/prefs";

import { api } from "@/adapters/platform";
import { DateTimeFields } from "@/components/parent/date-time-fields";
import { Button, Card, Notice, Text } from "@/components/ui";
import { clientState, useAccountStore, useVaultStore } from "@/lib/client-state";
import { useLocaleSetting } from "@/lib/intl";

export function DateTimeSettings() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const { locale } = useLocaleSetting();
  const session = useVaultStore((s) => s.session);
  const stored = useAccountStore(
    (s) => (s.account?.date_preferences ?? null) as StoredDatePreferences | null,
  );
  const isLoaded = useAccountStore((s) => s.loaded);

  const base = defaultPref(locale, "account");
  const [dateStyle, setDateStyle] = useState<DateStyleId>(base.dateStyle);
  const [timeStyle, setTimeStyle] = useState<TimeStyleId>(base.timeStyle);
  const [timeZone, setTimeZone] = useState("auto");
  const [isHydrated, setIsHydrated] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fill the controls once from the stored preference (after the vault opens,
  // when a sealed timezone needs it).
  useEffect(() => {
    if (isHydrated || !isLoaded) return;
    const initial = initialDateSettings(stored, session, {
      dateStyle: base.dateStyle,
      timeStyle: base.timeStyle,
    });
    if (!initial) return;
    setDateStyle(initial.dateStyle);
    setTimeStyle(initial.timeStyle);
    setTimeZone(initial.timeZone);
    setIsHydrated(true);
  }, [isHydrated, isLoaded, stored, session, base.dateStyle, base.timeStyle]);

  useEffect(() => {
    if (!isSaved) return;
    const timer = setTimeout(() => setIsSaved(false), 2500);
    return () => clearTimeout(timer);
  }, [isSaved]);

  async function save(): Promise<void> {
    setError(null);
    setIsSaving(true);
    const failure = await saveDateSettings(
      { api, account: clientState.account, vault: clientState.vault },
      { dateStyle, timeStyle, timeZone },
    );
    if (failure) setError("key" in failure ? t(failure.key) : failure.message);
    else setIsSaved(true);
    setIsSaving(false);
  }

  return (
    <Card title={t("dateTimeTitle")} description={t("dateTimeDescription")}>
      <DateTimeFields
        dateStyle={dateStyle}
        timeStyle={timeStyle}
        timeZone={timeZone}
        onDateStyle={(v) => setDateStyle((v || base.dateStyle) as DateStyleId)}
        onTimeStyle={(v) => setTimeStyle((v || base.timeStyle) as TimeStyleId)}
        onTimeZone={setTimeZone}
        basePref={base}
      />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <View className="flex-row items-center gap-3">
        <Button
          className="flex-1"
          label={isSaving ? tc("loading") : tc("save")}
          isLoading={isSaving}
          onPress={() => void save()}
        />
        {isSaved ? <Text variant="muted">{tc("saved")}</Text> : null}
      </View>
    </Card>
  );
}

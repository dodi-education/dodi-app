import { useEffect, useState } from "react";
import { useTranslations } from "use-intl";
import { persistLanguage } from "@dodi/client-state/onboarding";
import { SUPPORTED_LOCALES, type Locale } from "@dodi/intl/locales";

import { mobileAuthApi } from "@/adapters/auth";
import { api } from "@/adapters/platform";
import { FieldRow } from "@/components/settings/field-row";
import { DateTimeSettings } from "@/components/settings/date-time-settings";
import { InterfaceSettings } from "@/components/settings/interface-settings";
import { Card, Screen, Text } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { ChoiceList } from "@/components/ui/choice-list";
import { clientState, useAccountStore } from "@/lib/client-state";
import { useLocaleSetting } from "@/lib/intl";

/** Native language names. */
const LOCALE_NAMES: Record<Locale, string> = { en: "English", de: "Deutsch" };

/** General settings (web: parent/settings/general): account, interface, date and time. */
export default function GeneralSettingsScreen() {
  const t = useTranslations("settings");
  const { locale, setLocale } = useLocaleSetting();
  const tier = useAccountStore((s) => s.account?.subscribed_plan ?? "egg");
  const loadAccount = useAccountStore((s) => s.load);
  // Email and id from the auth session: display only.
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);

  useEffect(() => {
    void loadAccount();
    let isCurrent = true;
    void mobileAuthApi
      .sessionUser()
      .then((next) => {
        if (isCurrent) setUser(next);
      })
      .catch(() => {});
    return () => {
      isCurrent = false;
    };
  }, [loadAccount]);

  /** This device switches now; the account carries it to the others. */
  function changeLocale(next: Locale): void {
    if (next === locale) return;
    setLocale(next);
    void persistLanguage({ api, account: clientState.account }, next);
  }

  return (
    <Screen>
      <Card title={t("accountTitle")} description={t("accountDescription")}>
        <FieldRow label={t("email")}>
          <Text selectable>{user?.email ?? ""}</Text>
        </FieldRow>
        <FieldRow label={t("subscription")}>
          <Badge label={t("tierLabel", { tier: tier.charAt(0).toUpperCase() + tier.slice(1) })} />
        </FieldRow>
        <FieldRow label={t("accountId")}>
          <Text selectable variant="muted" className="font-mono">
            {user?.id ?? ""}
          </Text>
        </FieldRow>
        <ChoiceList
          label={t("language")}
          choices={SUPPORTED_LOCALES.map((l) => ({ value: l, label: LOCALE_NAMES[l] }))}
          value={locale}
          onChange={changeLocale}
        />
      </Card>
      <InterfaceSettings />
      <DateTimeSettings />
    </Screen>
  );
}

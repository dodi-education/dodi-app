import { useEffect, useState } from "react";
import { useTranslations } from "use-intl";

import { mobileAuthApi } from "@/adapters/auth";
import { FieldRow } from "@/components/parent/rows";
import { Section } from "@/components/parent/section";
import { DateTimeSettings } from "@/components/settings/date-time-settings";
import { InterfaceSettings } from "@/components/settings/interface-settings";
import { LanguageSwitcher } from "@/components/settings/language-switcher";
import { Badge, Text } from "@/components/ui";
import { useAccountStore } from "@/lib/client-state";

/** General settings (web: parent/settings/general/page): account, interface, date and time. */
export default function GeneralSettingsScreen() {
  const t = useTranslations("settings");
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

  return (
    <>
      <Section title={t("accountTitle")} desc={t("accountDescription")}>
        <FieldRow label={t("email")}>
          <Text selectable className="text-sm text-ink-2">
            {user?.email ?? ""}
          </Text>
        </FieldRow>
        <FieldRow label={t("language")}>
          <LanguageSwitcher />
        </FieldRow>
        <FieldRow label={t("subscription")}>
          {/* web: className="capitalize" on the badge */}
          <Badge variant="gray">{t("tierLabel", { tier: tier.charAt(0).toUpperCase() + tier.slice(1) })}</Badge>
        </FieldRow>
        <FieldRow label={t("accountId")}>
          <Text selectable className="font-mono text-[12.5px] text-muted-foreground">
            {user?.id ?? ""}
          </Text>
        </FieldRow>
      </Section>

      <InterfaceSettings />

      <DateTimeSettings />
    </>
  );
}

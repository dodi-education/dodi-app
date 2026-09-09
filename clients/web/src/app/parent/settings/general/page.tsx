"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { DateTimeSettings } from "@/components/parent/date-time-settings";
import { FieldRow } from "@/components/parent/rows";
import { Section } from "@/components/parent/section";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { Badge } from "@/components/ui/badge";
import { authClient } from "@/lib/auth/client";
import { useAccountStore } from "@/stores/account-store";

export default function GeneralSettingsPage() {
  const t = useTranslations("settings");
  // Email/id from the shared auth session (cached by the auth client) —
  // display only.
  const { data: session } = authClient.useSession();
  const user = session?.user ?? null;
  const tier = useAccountStore((s) => s.account?.subscribed_plan ?? "egg");
  const loadAccount = useAccountStore((s) => s.load);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  return (
    <div>
      <Section title={t("accountTitle")} desc={t("accountDescription")}>
        <FieldRow label={t("email")}>
          <span className="text-sm text-ink-2">{user?.email}</span>
        </FieldRow>
        <FieldRow label={t("language")}>
          <LanguageSwitcher />
        </FieldRow>
        <FieldRow label={t("subscription")}>
          <Badge variant="gray" className="capitalize">
            {t("tierLabel", { tier })}
          </Badge>
        </FieldRow>
        <FieldRow label={t("accountId")}>
          <span className="font-mono text-[12.5px] text-muted-foreground">
            {user?.id}
          </span>
        </FieldRow>
      </Section>

      <DateTimeSettings />
    </div>
  );
}

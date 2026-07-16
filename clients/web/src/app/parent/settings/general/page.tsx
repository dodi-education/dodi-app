"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { DateTimeSettings } from "@/components/parent/date-time-settings";
import { FieldRow } from "@/components/parent/rows";
import { Section } from "@/components/parent/section";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { Badge } from "@/components/ui/badge";
import { useAccountStore } from "@/stores/account-store";
import { createClient } from "@/lib/supabase/client";

export default function GeneralSettingsPage() {
  const t = useTranslations("settings");
  const [user, setUser] = useState<{ email: string; id: string } | null>(null);
  const tier = useAccountStore((s) => s.account?.subscribed_plan ?? "egg");
  const loadAccount = useAccountStore((s) => s.load);

  useEffect(() => {
    void loadAccount();
    // Email/id from the local auth session — display only, no network hop.
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      if (u) setUser({ email: u.email ?? "", id: u.id });
    });
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

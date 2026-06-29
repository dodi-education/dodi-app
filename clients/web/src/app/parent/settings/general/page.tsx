"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { DateTimeSettings } from "@/components/parent/date-time-settings";
import { FieldRow } from "@/components/parent/rows";
import { Section } from "@/components/parent/section";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { Badge } from "@/components/ui/badge";
import { dodi } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";

export default function GeneralSettingsPage() {
  const t = useTranslations("settings");
  const [user, setUser] = useState<{ email: string; id: string } | null>(null);
  const [tier, setTier] = useState("free");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUser({ email: data.user.email ?? "", id: data.user.id });
    });
    dodi
      .request("/api/account")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.account?.subscription_tier) setTier(d.account.subscription_tier);
      })
      .catch(() => {});
  }, []);

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

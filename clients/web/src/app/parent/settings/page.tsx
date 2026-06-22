import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { AIProviderConfig } from "@/components/parent/ai-provider-config";
import { ChangePassword } from "@/components/parent/change-password";
import { FieldRow } from "@/components/parent/rows";
import { PageHead, Section } from "@/components/parent/section";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { Badge } from "@/components/ui/badge";
import { getAccount } from "@dodi/platform/services/accounts";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const t = await getTranslations("settings");
  const account = await getAccount(supabase, user.id);

  return (
    <div>
      <PageHead title={t("title")} sub={t("subtitle")} />

      <Section title={t("accountTitle")} desc={t("accountDescription")}>
        <FieldRow label={t("email")}>
          <span className="text-sm text-ink-2">{user.email}</span>
        </FieldRow>
        <FieldRow label={t("language")}>
          <LanguageSwitcher />
        </FieldRow>
        <FieldRow label={t("subscription")}>
          <Badge variant="gray" className="capitalize">
            {t("tierLabel", { tier: account?.subscription_tier ?? "free" })}
          </Badge>
        </FieldRow>
        <FieldRow label={t("accountId")}>
          <span className="font-mono text-[12.5px] text-muted-foreground">
            {user.id}
          </span>
        </FieldRow>
      </Section>

      <ChangePassword />

      <AIProviderConfig />
    </div>
  );
}

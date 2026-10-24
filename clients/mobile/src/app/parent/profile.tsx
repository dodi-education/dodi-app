import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "use-intl";
import { loadMyFamilies, ownsAnAccount, type LoginFamily } from "@dodi/client-state/family-members";

import { mobileAuthApi } from "@/adapters/auth";
import { api } from "@/adapters/platform";
import { BackLink } from "@/components/parent/back-link";
import { FieldRow } from "@/components/parent/rows";
import { Section } from "@/components/parent/section";
import { AccountSwitcher } from "@/components/profile/account-switcher";
import { DeleteProfile } from "@/components/profile/delete-profile";
import { ShellContent } from "@/components/shared/shell-content";
import { ChangePassword } from "@/components/settings/change-password";
import { LanguageSwitcher } from "@/components/settings/language-switcher";
import { Text } from "@/components/ui";

/**
 * The person's own page (web: app/parent/profile/page), opened from their
 * email at the foot of the menu: email, language, password, their accounts
 * and deleting their profile. The account's settings stay under Settings.
 */
export default function ProfileScreen() {
  const t = useTranslations("profile");
  const ts = useTranslations("settings");
  const [email, setEmail] = useState<string | null>(null);
  const [families, setFamilies] = useState<LoginFamily[] | null>(null);

  const loadFamilies = useCallback(async () => {
    setFamilies(await loadMyFamilies(api));
  }, []);

  useEffect(() => {
    let isCurrent = true;
    void mobileAuthApi
      .sessionUser()
      .then((user) => {
        if (isCurrent) setEmail(user?.email ?? null);
      })
      .catch(() => {});
    void loadMyFamilies(api).then((next) => {
      if (isCurrent) setFamilies(next);
    });
    return () => {
      isCurrent = false;
    };
  }, []);

  return (
    <ShellContent onRefresh={loadFamilies}>
      <BackLink href="/parent/dashboard">{t("back")}</BackLink>
      <Section title={t("detailsTitle")} desc={t("detailsDesc")}>
        <FieldRow label={ts("email")}>
          <Text selectable className="text-sm text-ink-2">
            {email ?? ""}
          </Text>
        </FieldRow>
        <FieldRow label={ts("language")}>
          <LanguageSwitcher />
        </FieldRow>
      </Section>

      {families ? <AccountSwitcher families={families} /> : null}

      <ChangePassword />

      <DeleteProfile ownsAccount={families ? ownsAnAccount(families) : null} />
    </ShellContent>
  );
}

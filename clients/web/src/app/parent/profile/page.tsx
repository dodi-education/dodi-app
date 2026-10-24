"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { loadMyFamilies, ownsAnAccount, type LoginFamily } from "@dodi/client-state/family-members";

import { BackLink } from "@/components/parent/back-link";
import { ChangePassword } from "@/components/parent/change-password";
import { AccountSwitcher } from "@/components/parent/profile/account-switcher";
import { DeleteProfile } from "@/components/parent/profile/delete-profile";
import { FieldRow } from "@/components/parent/rows";
import { Section } from "@/components/parent/section";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { dodi } from "@/lib/api";
import { authClient } from "@/lib/auth/client";

/**
 * The person's own page, reached from their email at the foot of the menu:
 * what belongs to them rather than to the account they are using (email,
 * language, password, their accounts, deleting their profile). The account's
 * settings stay under Settings.
 */
export default function ProfilePage() {
  const t = useTranslations("profile");
  const ts = useTranslations("settings");
  const { data: session } = authClient.useSession();
  const [families, setFamilies] = useState<LoginFamily[] | null>(null);

  useEffect(() => {
    let isCurrent = true;
    void loadMyFamilies(dodi).then((next) => {
      if (isCurrent) setFamilies(next);
    });
    return () => {
      isCurrent = false;
    };
  }, []);

  return (
    <div>
      <BackLink href="/parent/dashboard">{t("back")}</BackLink>
      <Section title={t("detailsTitle")} desc={t("detailsDesc")}>
        <FieldRow label={ts("email")}>
          <span className="text-sm text-ink-2">{session?.user.email}</span>
        </FieldRow>
        <FieldRow label={ts("language")}>
          <LanguageSwitcher />
        </FieldRow>
      </Section>

      {families ? <AccountSwitcher families={families} /> : null}

      <ChangePassword />

      <DeleteProfile ownsAccount={families ? ownsAnAccount(families) : null} />
    </div>
  );
}

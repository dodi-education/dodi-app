"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { DateTimeSettings } from "@/components/parent/date-time-settings";
import { DeleteAccount } from "@/components/parent/delete-account";
import { InterfaceSettings } from "@/components/parent/interface-settings";
import { LeaveAccount } from "@/components/parent/leave-account";
import { LegalLinks } from "@/components/parent/legal-links";
import { FieldRow } from "@/components/parent/rows";
import { Section } from "@/components/parent/section";
import { Badge } from "@/components/ui/badge";
import { useAccountStore } from "@/stores/account-store";

const ROLE_KEYS = { owner: "roleOwner", co_parent: "roleCoParent", member: "roleMember" } as const;

/**
 * The active account's general settings. What belongs to the person (email,
 * language, password, their accounts, deleting their profile) is on the
 * profile page instead.
 */
export default function GeneralSettingsPage() {
  const t = useTranslations("settings");
  const ta = useTranslations("access");
  const accountId = useAccountStore((s) => s.account?.id ?? null);
  const member = useAccountStore((s) => s.member);
  const tier = useAccountStore((s) => s.account?.subscribed_plan ?? "egg");
  const loadAccount = useAccountStore((s) => s.load);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  return (
    <div>
      <Section title={t("accountTitle")} desc={t("accountDescription")}>
        {member ? (
          <FieldRow label={t("yourRole")}>
            <span className="text-sm text-ink-2">{ta(ROLE_KEYS[member.role])}</span>
          </FieldRow>
        ) : null}
        <FieldRow label={t("subscription")}>
          <Badge variant="gray" className="capitalize">
            {t("tierLabel", { tier })}
          </Badge>
        </FieldRow>
        <FieldRow label={t("accountId")}>
          <span className="font-mono text-[12.5px] text-muted-foreground">
            {accountId}
          </span>
        </FieldRow>
      </Section>

      {/* Date format and interface are the account's: a scoped member can't change them. */}
      {member?.role === "member" ? null : (
        <>
          <InterfaceSettings />
          <DateTimeSettings />
        </>
      )}

      <LegalLinks />

      {member?.role === "owner" ? <DeleteAccount /> : null}
      {member && member.role !== "owner" ? <LeaveAccount userId={member.user_id} /> : null}
    </div>
  );
}

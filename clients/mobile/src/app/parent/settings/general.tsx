import { useEffect } from "react";
import { useTranslations } from "use-intl";

import { FieldRow } from "@/components/parent/rows";
import { Section } from "@/components/parent/section";
import { DateTimeSettings } from "@/components/settings/date-time-settings";
import { DeleteAccount } from "@/components/settings/delete-account";
import { InterfaceSettings } from "@/components/settings/interface-settings";
import { LeaveAccount } from "@/components/settings/leave-account";
import { LegalLinks } from "@/components/settings/legal-links";
import { Badge, Text } from "@/components/ui";
import { useAccountStore } from "@/lib/client-state";

const ROLE_KEYS = { owner: "roleOwner", co_parent: "roleCoParent", member: "roleMember" } as const;

/**
 * The active account's general settings (web: parent/settings/general/page):
 * role, plan, id, interface, date and time, legal, deleting or leaving the
 * account. What belongs to the person is on the profile screen.
 */
export default function GeneralSettingsScreen() {
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
    <>
      <Section title={t("accountTitle")} desc={t("accountDescription")}>
        {member ? (
          <FieldRow label={t("yourRole")}>
            <Text className="text-sm text-ink-2">{ta(ROLE_KEYS[member.role])}</Text>
          </FieldRow>
        ) : null}
        <FieldRow label={t("subscription")}>
          {/* web: className="capitalize" on the badge */}
          <Badge variant="gray">{t("tierLabel", { tier: tier.charAt(0).toUpperCase() + tier.slice(1) })}</Badge>
        </FieldRow>
        <FieldRow label={t("accountId")}>
          <Text selectable className="font-mono text-[12.5px] text-muted-foreground">
            {accountId ?? ""}
          </Text>
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
    </>
  );
}

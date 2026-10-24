"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { formAlert } from "@dodi/ui-recipes";
import { leaveFamily } from "@dodi/client-state/family-members";

import { Row, RowMain, RowMeta, RowTitle } from "@/components/parent/rows";
import { Section } from "@/components/parent/section";
import { Icon } from "@/components/shared/icon";
import { Button } from "@/components/ui/button";
import { dodi } from "@/lib/api";
import { clientState } from "@/lib/client-state";
import { cn } from "@/lib/utils";

/**
 * Settings > General > Leave account (everyone but the owner): the person
 * leaves this account; their profile and the account stay. This device then
 * reloads into another account of theirs or the "no account" screen.
 */
export function LeaveAccount({ userId }: { userId: string }) {
  const t = useTranslations("settings");
  const ta = useTranslations("access");
  const [isLeaving, setIsLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function leave() {
    if (!window.confirm(ta("confirmLeave"))) return;
    setIsLeaving(true);
    setError(null);
    const deps = { api: dodi, vault: clientState.vault, dropFamilyData: clientState.dropFamilyData };
    if (await leaveFamily(deps, userId)) {
      window.location.assign("/parent/dashboard");
      return;
    }
    setError(ta("leaveFailed"));
    setIsLeaving(false);
  }

  return (
    <Section title={t("leaveAccountTitle")}>
      <Row>
        <RowMain>
          <RowTitle>{t("leaveAccountRowTitle")}</RowTitle>
          <RowMeta>{t("leaveAccountRowMeta")}</RowMeta>
        </RowMain>
        <Button variant="destructive" disabled={isLeaving} onClick={() => void leave()}>
          <Icon name="logout" size={14} />
          {isLeaving ? t("leaveAccountLeaving") : t("leaveAccountButton")}
        </Button>
      </Row>
      {error ? (
        <div className="px-5 pb-4">
          <p role="alert" className={cn(formAlert.box, formAlert.text)}>
            {error}
          </p>
        </div>
      ) : null}
    </Section>
  );
}

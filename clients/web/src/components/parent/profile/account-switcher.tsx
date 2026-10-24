"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import {
  ownsAnAccount,
  startOwnFamily,
  switchFamily,
  type LoginFamily,
} from "@dodi/client-state/family-members";
import { formAlert } from "@dodi/ui-recipes";

import { FieldRow, fieldSelectClass } from "@/components/parent/rows";
import { Section } from "@/components/parent/section";
import { Button } from "@/components/ui/button";
import { dodi } from "@/lib/api";
import { clientState } from "@/lib/client-state";
import { cn } from "@/lib/utils";

const ROLE_KEYS = { owner: "roleOwner", co_parent: "roleCoParent", member: "roleMember" } as const;

/**
 * Profile > Your accounts: which account this profile is using (a profile can
 * belong to several, e.g. grandparents in two), switching between them, and
 * creating one of its own. Switching drops this device's view of the old
 * account and opens the other's vault.
 */
export function AccountSwitcher({ families }: { families: LoginFamily[] }) {
  const t = useTranslations("profile");
  const ta = useTranslations("access");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deps = { api: dodi, vault: clientState.vault, dropFamilyData: clientState.dropFamilyData };

  async function run(action: () => Promise<boolean>) {
    setIsBusy(true);
    setError(null);
    if (await action()) {
      // A full load: every screen starts over in the other account.
      window.location.assign("/parent/dashboard");
      return;
    }
    setError(t("switchFailed"));
    setIsBusy(false);
  }

  if (families.length === 0) return null;
  const active = families.find((family) => family.isActive) ?? families[0];
  const label = (family: LoginFamily) =>
    t("accountRole", {
      account:
        family.role === "owner" ? t("accountYours") : t("accountOf", { email: family.ownerEmail ?? "" }),
      role: ta(ROLE_KEYS[family.role]),
    });

  return (
    <Section title={t("accountsTitle")} desc={t("accountsDesc")}>
      <FieldRow label={t("accountsCurrent")} htmlFor="account-switch">
        {families.length > 1 ? (
          <select
            id="account-switch"
            className={fieldSelectClass}
            value={active.accountId}
            disabled={isBusy}
            onChange={(e) => void run(() => switchFamily(deps, e.target.value))}
          >
            {families.map((family) => (
              <option key={family.accountId} value={family.accountId}>
                {label(family)}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-sm text-ink-2">{label(active)}</span>
        )}
      </FieldRow>
      {ownsAnAccount(families) ? null : (
        <FieldRow label={t("startOwn")} hint={t("startOwnHint")}>
          <Button
            variant="outline"
            className="min-h-11"
            disabled={isBusy}
            onClick={() => void run(async () => (await startOwnFamily(deps)).kind === "started")}
          >
            {t("startOwnButton")}
          </Button>
        </FieldRow>
      )}
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

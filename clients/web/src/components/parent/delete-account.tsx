"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { deleteAccount } from "@dodi/client-state/account-deletion";

import { PasswordConfirmDialog } from "@/components/parent/password-confirm-dialog";
import { Row, RowMain, RowMeta, RowTitle } from "@/components/parent/rows";
import { Section } from "@/components/parent/section";
import { Icon } from "@/components/shared/icon";
import { Button } from "@/components/ui/button";
import { dodi } from "@/lib/api";
import { clientState } from "@/lib/client-state";
import { isDodiAIConfigured } from "@/lib/dodi-ai";

const CONSEQUENCE_KEYS = [
  "deleteAccountConsequenceData",
  "deleteAccountConsequenceMembers",
  "deleteAccountConsequenceDiscover",
  "deleteAccountConsequenceFriends",
] as const;

/**
 * Settings > General > Delete account (the owner only): the in-app deletion
 * both app stores require. The platform re-checks the password and erases the
 * account with all its data. The owner's profile stays: this device drops the
 * account and reloads into another account of theirs or the "no account"
 * screen, where the profile can be deleted too.
 */
export function DeleteAccount() {
  const t = useTranslations("settings");
  const [isOpen, setIsOpen] = useState(false);
  const consequences = CONSEQUENCE_KEYS.map((key) => t(key));
  // Credits exist only where dodi AI is offered.
  if (isDodiAIConfigured()) consequences.push(t("deleteAccountConsequenceCredits"));

  async function confirm(password: string): Promise<string | null> {
    const outcome = await deleteAccount(
      { api: dodi, vault: clientState.vault, dropFamilyData: clientState.dropFamilyData },
      password,
    );
    if (outcome.kind === "error") return t(outcome.key);
    // A full load: every screen starts over without the deleted account.
    window.location.assign("/parent/dashboard");
    return null;
  }

  return (
    <>
      <Section title={t("deleteAccountTitle")}>
        <Row>
          <RowMain>
            <RowTitle>{t("deleteAccountRowTitle")}</RowTitle>
            <RowMeta>{t("deleteAccountRowMeta")}</RowMeta>
          </RowMain>
          <Button variant="destructive" onClick={() => setIsOpen(true)}>
            <Icon name="delete" size={14} />
            {t("deleteAccountButton")}
          </Button>
        </Row>
      </Section>
      <PasswordConfirmDialog
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={t("deleteAccountDialogTitle")}
        description={t("deleteAccountDialogDescription")}
        consequences={consequences}
        confirmLabel={t("deleteAccountConfirm")}
        busyLabel={t("deleteAccountDeleting")}
        onConfirm={confirm}
      />
    </>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { deleteProfile } from "@dodi/client-state/account-deletion";

import { PasswordConfirmDialog } from "@/components/parent/password-confirm-dialog";
import { Row, RowMain, RowMeta, RowTitle } from "@/components/parent/rows";
import { Section } from "@/components/parent/section";
import { Icon } from "@/components/shared/icon";
import { Button } from "@/components/ui/button";
import { dodi } from "@/lib/api";
import { endSession, wipeDeviceData } from "@/lib/auth/end-session";

/**
 * The profile deletion dialog: the platform re-checks the password and erases
 * the login (refused while it owns an account). Every session ends with it,
 * so this browser signs out and is wiped.
 */
export function DeleteProfileDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const t = useTranslations("profile");
  const ts = useTranslations("settings");
  const router = useRouter();

  async function confirm(password: string): Promise<string | null> {
    const outcome = await deleteProfile({ api: dodi }, password);
    if (outcome.kind === "error") return ts(outcome.key);
    await endSession();
    await wipeDeviceData();
    router.push("/login?deleted=1");
    router.refresh();
    return null;
  }

  return (
    <PasswordConfirmDialog
      isOpen={isOpen}
      onClose={onClose}
      title={t("deleteDialogTitle")}
      description={t("deleteDialogDescription")}
      consequences={[t("deleteConsequenceAccess"), t("deleteConsequenceAccounts")]}
      confirmLabel={t("deleteConfirm")}
      busyLabel={t("deleting")}
      onConfirm={confirm}
    />
  );
}

/**
 * Profile > Delete profile. An owner deletes their account(s) first, so the
 * button stays off while this profile owns one (`ownsAccount` null = not
 * known yet).
 */
export function DeleteProfile({ ownsAccount }: { ownsAccount: boolean | null }) {
  const t = useTranslations("profile");
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <Section title={t("deleteTitle")}>
        <Row>
          <RowMain>
            <RowTitle>{t("deleteRowTitle")}</RowTitle>
            <RowMeta>{ownsAccount ? t("deleteOwnsAccount") : t("deleteRowMeta")}</RowMeta>
          </RowMain>
          <Button variant="destructive" disabled={ownsAccount !== false} onClick={() => setIsOpen(true)}>
            <Icon name="delete" size={14} />
            {t("deleteButton")}
          </Button>
        </Row>
      </Section>
      <DeleteProfileDialog isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}

import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { deleteProfile } from "@dodi/client-state/account-deletion";

import { wipeDeviceData } from "@/adapters/device-wipe";
import { api } from "@/adapters/platform";
import { Row, RowMain, RowMeta, RowTitle } from "@/components/parent/rows";
import { Section } from "@/components/parent/section";
import { PasswordConfirmDialog } from "@/components/settings/password-confirm-dialog";
import { Button } from "@/components/ui";
import { signOut } from "@/lib/session";

/**
 * The profile deletion dialog (web: components/parent/profile/delete-profile):
 * the platform re-checks the password and erases the login (refused while it
 * owns an account). Every session ends with it, so this device signs out and
 * is wiped.
 */
export function DeleteProfileDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const t = useTranslations("profile");
  const ts = useTranslations("settings");
  const router = useRouter();

  async function confirm(password: string): Promise<string | null> {
    const outcome = await deleteProfile({ api }, password);
    if (outcome.kind === "error") return ts(outcome.key);
    await signOut();
    await wipeDeviceData();
    router.replace({ pathname: "/login", params: { deleted: "1" } });
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
          <Button
            variant="destructive"
            icon="delete"
            disabled={ownsAccount !== false}
            onPress={() => setIsOpen(true)}
          >
            {t("deleteButton")}
          </Button>
        </Row>
      </Section>
      <DeleteProfileDialog isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}

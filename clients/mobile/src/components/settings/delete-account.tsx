import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { deleteAccount } from "@dodi/client-state/account-deletion";

import { api } from "@/adapters/platform";
import { Row, RowMain, RowMeta, RowTitle } from "@/components/parent/rows";
import { Section } from "@/components/parent/section";
import { Button } from "@/components/ui";
import { clientState } from "@/lib/client-state";

import { PasswordConfirmDialog } from "./password-confirm-dialog";

const CONSEQUENCE_KEYS = [
  "deleteAccountConsequenceData",
  "deleteAccountConsequenceMembers",
  "deleteAccountConsequenceDiscover",
  "deleteAccountConsequenceFriends",
  // Credits exist only where dodi AI is offered.
  ...(clientState.dodiAI.isConfigured() ? (["deleteAccountConsequenceCredits"] as const) : []),
] as const;

/**
 * Settings > General > Delete account, the owner only (web:
 * components/parent/delete-account): the in-app deletion both app stores
 * require. The platform re-checks the password and erases the account. The
 * owner's profile stays: this device drops the account and opens another
 * account of theirs or the "no account" screen.
 */
export function DeleteAccount() {
  const t = useTranslations("settings");
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  async function confirm(password: string): Promise<string | null> {
    const outcome = await deleteAccount(
      { api, vault: clientState.vault, dropFamilyData: clientState.dropFamilyData },
      password,
    );
    if (outcome.kind === "error") return t(outcome.key);
    router.replace("/parent/dashboard");
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
          <Button variant="destructive" icon="delete" onPress={() => setIsOpen(true)}>
            {t("deleteAccountButton")}
          </Button>
        </Row>
      </Section>
      <PasswordConfirmDialog
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={t("deleteAccountDialogTitle")}
        description={t("deleteAccountDialogDescription")}
        consequences={CONSEQUENCE_KEYS.map((key) => t(key))}
        confirmLabel={t("deleteAccountConfirm")}
        busyLabel={t("deleteAccountDeleting")}
        onConfirm={confirm}
      />
    </>
  );
}

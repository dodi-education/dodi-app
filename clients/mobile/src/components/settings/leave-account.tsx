import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";
import { leaveFamily } from "@dodi/client-state/family-members";

import { api } from "@/adapters/platform";
import { FormAlert } from "@/components/games-library/form-alert";
import { Row, RowMain, RowMeta, RowTitle } from "@/components/parent/rows";
import { Section } from "@/components/parent/section";
import { Button, Dialog } from "@/components/ui";
import { clientState } from "@/lib/client-state";

/**
 * Settings > General > Leave account, everyone but the owner (web:
 * components/parent/leave-account): the person leaves this account; their
 * profile and the account stay. This device then opens another account of
 * theirs or the "no account" screen.
 */
export function LeaveAccount({ userId }: { userId: string }) {
  const t = useTranslations("settings");
  const ta = useTranslations("access");
  const tc = useTranslations("common");
  const router = useRouter();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function leave(): Promise<void> {
    setIsConfirming(false);
    setIsLeaving(true);
    setError(null);
    const deps = { api, vault: clientState.vault, dropFamilyData: clientState.dropFamilyData };
    if (await leaveFamily(deps, userId)) {
      router.replace("/parent/dashboard");
      return;
    }
    setError(ta("leaveFailed"));
    setIsLeaving(false);
  }

  return (
    <>
      <Section title={t("leaveAccountTitle")}>
        <Row>
          <RowMain>
            <RowTitle>{t("leaveAccountRowTitle")}</RowTitle>
            <RowMeta>{t("leaveAccountRowMeta")}</RowMeta>
          </RowMain>
          <Button
            variant="destructive"
            icon="logout"
            isLoading={isLeaving}
            disabled={isLeaving}
            onPress={() => setIsConfirming(true)}
          >
            {isLeaving ? t("leaveAccountLeaving") : t("leaveAccountButton")}
          </Button>
        </Row>
        {error ? (
          <View className="px-5 pb-4">
            <FormAlert>{error}</FormAlert>
          </View>
        ) : null}
      </Section>
      {/* web: window.confirm */}
      <Dialog
        isOpen={isConfirming}
        onClose={() => setIsConfirming(false)}
        title={t("leaveAccountButton")}
        description={ta("confirmLeave")}
        footer={
          <>
            <Button variant="destructive" onPress={() => void leave()}>
              {t("leaveAccountButton")}
            </Button>
            <Button variant="outline" onPress={() => setIsConfirming(false)}>
              {tc("cancel")}
            </Button>
          </>
        }
      />
    </>
  );
}

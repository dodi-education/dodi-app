import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";
import { deleteAccount } from "@dodi/client-state/account-deletion";

import { wipeDeviceData } from "@/adapters/device-wipe";
import { api } from "@/adapters/platform";
import { FormAlert } from "@/components/games-library/form-alert";
import { Row, RowMain, RowMeta, RowTitle } from "@/components/parent/rows";
import { Section } from "@/components/parent/section";
import { Button, Dialog, Label, PasswordInput, Text } from "@/components/ui";
import { clientState } from "@/lib/client-state";
import { signOut } from "@/lib/session";

const CONSEQUENCE_KEYS = [
  "deleteAccountConsequenceData",
  "deleteAccountConsequenceDiscover",
  "deleteAccountConsequenceFriends",
  // Credits exist only where dodi AI is offered.
  ...(clientState.dodiAI.isConfigured() ? (["deleteAccountConsequenceCredits"] as const) : []),
] as const;

/**
 * Settings > General > Delete account (web: components/parent/delete-account):
 * the in-app deletion both app stores require. The platform re-checks the
 * password and erases the account; this device is then signed out and wiped.
 */
export function DeleteAccount() {
  const t = useTranslations("settings");
  const ta = useTranslations("auth");
  const tc = useTranslations("common");
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close(): void {
    if (isDeleting) return;
    setIsOpen(false);
    setPassword("");
    setError(null);
  }

  async function confirm(): Promise<void> {
    setError(null);
    setIsDeleting(true);
    const outcome = await deleteAccount({ api }, password);
    if (outcome.kind === "deleted") {
      await signOut();
      await wipeDeviceData();
      router.replace({ pathname: "/login", params: { deleted: "1" } });
      return;
    }
    setError(t(outcome.key));
    setIsDeleting(false);
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

      <Dialog
        isOpen={isOpen}
        onClose={close}
        title={t("deleteAccountDialogTitle")}
        description={t("deleteAccountDialogDescription")}
        footer={
          <>
            <Button
              variant="destructive"
              icon="delete"
              isLoading={isDeleting}
              disabled={isDeleting || !password}
              onPress={() => void confirm()}
            >
              {isDeleting ? t("deleteAccountDeleting") : t("deleteAccountConfirm")}
            </Button>
            <Button variant="outline" disabled={isDeleting} onPress={close}>
              {tc("cancel")}
            </Button>
          </>
        }
      >
        <View className="flex-col gap-4">
          <View className="flex-col gap-1.5">
            {CONSEQUENCE_KEYS.map((key) => (
              <View key={key} className="flex-row gap-2">
                <Text className="text-sm text-ink-2">•</Text>
                <Text className="flex-1 text-sm text-ink-2">{t(key)}</Text>
              </View>
            ))}
          </View>
          <View className="flex-col gap-2">
            <Label>{t("deleteAccountPasswordLabel")}</Label>
            <PasswordInput
              value={password}
              onChangeText={(next) => {
                setError(null);
                setPassword(next);
              }}
              autoComplete="current-password"
              textContentType="password"
              accessibilityLabel={t("deleteAccountPasswordLabel")}
              showPasswordLabel={ta("showPassword")}
              hidePasswordLabel={ta("hidePassword")}
            />
          </View>
          {error ? <FormAlert>{error}</FormAlert> : null}
        </View>
      </Dialog>
    </>
  );
}

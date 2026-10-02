/**
 * Change the password (web: parent/change-password): the auth password, then
 * the vault re-wrapped under it. The open vault proves access, so no old
 * password is asked.
 */
import { useState } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";
import { changePassword } from "@dodi/client-state/change-password";

import { mobileAuthApi } from "@/adapters/auth";
import { Section } from "@/components/parent/section";
import { Button, Input, Label, Text } from "@/components/ui";
import { clientState } from "@/lib/client-state";

export function ChangePassword() {
  const t = useTranslations("settings");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDone, setIsDone] = useState(false);

  function edit(setter: (value: string) => void) {
    return (value: string) => {
      setError(null);
      setIsDone(false);
      setter(value);
    };
  }

  async function submit(): Promise<void> {
    setError(null);
    setIsDone(false);
    setIsBusy(true);
    // Auth first; the vault is re-wrapped only once that succeeds.
    const outcome = await changePassword(
      { auth: mobileAuthApi, vault: clientState.vault },
      { password, confirm },
    );
    if (outcome.kind === "done") {
      setIsDone(true);
      setPassword("");
      setConfirm("");
    } else {
      setError(outcome.key ? t(outcome.key) : (outcome.message ?? t("changePasswordFailed")));
    }
    setIsBusy(false);
  }

  return (
    <Section title={t("changePasswordTitle")} desc={t("changePasswordDescription")}>
      <View className="flex-col gap-4 px-5 py-4">
        <View className="flex-col gap-2">
          <Label>{t("newPassword")}</Label>
          <Input
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel={t("newPassword")}
            value={password}
            onChangeText={edit(setPassword)}
            autoComplete="new-password"
            textContentType="newPassword"
          />
        </View>
        <View className="flex-col gap-2">
          <Label>{t("confirmNewPassword")}</Label>
          <Input
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel={t("confirmNewPassword")}
            value={confirm}
            onChangeText={edit(setConfirm)}
            autoComplete="new-password"
            textContentType="newPassword"
            onSubmitEditing={() => void submit()}
          />
        </View>
        {error ? (
          <Text className="text-sm text-destructive" accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        {isDone ? <Text className="text-sm text-success">{t("passwordChanged")}</Text> : null}
        <View className="flex-row">
          <Button disabled={isBusy || !password || !confirm} onPress={() => void submit()}>
            {isBusy ? t("updatingPassword") : t("updatePassword")}
          </Button>
        </View>
      </View>
    </Section>
  );
}

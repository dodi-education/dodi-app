import { Link, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";
import {
  hasStoredVault,
  updatePassword,
  validateNewPassword,
} from "@dodi/client-state/password-reset";

import { mobileAuthApi } from "@/adapters/auth";
import { api } from "@/adapters/platform";
import { Button, Notice, Screen, Text, TextField } from "@/components/ui";
import { clientState } from "@/lib/client-state";
import { markSignedIn } from "@/lib/session";

/**
 * Forgot password, step two (web: (auth)/update-password). The emailed code
 * already signed the parent in; set the new auth password on that session.
 * Data is end-to-end encrypted and the old password is unknown, so the vault
 * is re-wrapped under the new password with the nsec account key, which is
 * verified before either changes.
 */
export default function UpdatePasswordScreen() {
  const t = useTranslations("auth");
  const router = useRouter();
  // null = still checking whether this account has a vault.
  const [hasVault, setHasVault] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [nsec, setNsec] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    void hasStoredVault(api).then(setHasVault);
  }, []);

  async function submit(): Promise<void> {
    setError(null);
    const form = { password, confirmPassword, nsec, hasVault: hasVault === true };
    const invalid = validateNewPassword(form);
    if (invalid) {
      setError(t(invalid));
      return;
    }
    setIsLoading(true);
    const outcome = await updatePassword({ auth: mobileAuthApi, vault: clientState.vault }, form);
    if (outcome.kind === "error") {
      setError(outcome.key ? t(outcome.key) : (outcome.message ?? ""));
      setIsLoading(false);
      return;
    }
    router.replace("/parent/dashboard");
    markSignedIn();
  }

  const secure = { showLabel: t("showPassword"), hideLabel: t("hidePassword") };
  return (
    <Screen isCentered>
      <View className="gap-1">
        <Text variant="title">{t("updatePasswordTitle")}</Text>
        <Text variant="muted">
          {hasVault === false ? t("updatePasswordDescription") : t("updatePasswordWithNsecHint")}
        </Text>
      </View>
      <TextField
        label={t("newPassword")}
        placeholder={t("passwordPlaceholder")}
        value={password}
        onChangeText={setPassword}
        autoComplete="new-password"
        textContentType="newPassword"
        secure={secure}
        autoFocus
      />
      <TextField
        label={t("confirmPassword")}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        autoComplete="new-password"
        textContentType="newPassword"
        secure={secure}
      />
      {hasVault ? (
        <TextField
          label={t("accountKey")}
          placeholder={t("accountKeyPlaceholder")}
          value={nsec}
          onChangeText={setNsec}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
        />
      ) : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Button
        label={isLoading ? t("updatingPassword") : t("updatePassword")}
        isLoading={isLoading}
        disabled={hasVault === null || !password || !confirmPassword}
        onPress={() => void submit()}
      />
      <Link href="/login" asChild>
        <Button variant="ghost" label={t("backToSignIn")} />
      </Link>
    </Screen>
  );
}

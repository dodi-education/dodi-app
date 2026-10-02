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
import { AuthLayout } from "@/components/shared/auth-layout";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Text,
} from "@/components/ui";
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

  return (
    <AuthLayout>
      <Card>
        <CardHeader>
          <CardTitle>{t("updatePasswordTitle")}</CardTitle>
          <CardDescription>
            {hasVault === false ? t("updatePasswordDescription") : t("updatePasswordWithNsecHint")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <View className="flex flex-col gap-4">
            <View className="flex flex-col gap-2">
              <Label>{t("newPassword")}</Label>
              <Input
                placeholder={t("passwordPlaceholder")}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
                accessibilityLabel={t("newPassword")}
                autoFocus
              />
            </View>
            <View className="flex flex-col gap-2">
              <Label>{t("confirmPassword")}</Label>
              <Input
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
                accessibilityLabel={t("confirmPassword")}
              />
            </View>
            {hasVault ? (
              <View className="flex flex-col gap-2">
                <Label>{t("accountKey")}</Label>
                <Input
                  value={nsec}
                  onChangeText={setNsec}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={t("accountKeyPlaceholder")}
                  className="font-mono"
                  accessibilityLabel={t("accountKey")}
                />
              </View>
            ) : null}
            {error ? <Text className="text-sm text-destructive">{error}</Text> : null}
            <Button
              onPress={() => void submit()}
              disabled={isLoading || hasVault === null || !password || !confirmPassword}
              className="w-full"
            >
              {isLoading ? t("updatingPassword") : t("updatePassword")}
            </Button>
          </View>
        </CardContent>
        <CardFooter>
          <Link href="/login" asChild>
            <Text accessibilityRole="link" className="text-sm text-muted-foreground">
              {t("backToSignIn")}
            </Text>
          </Link>
        </CardFooter>
      </Card>
    </AuthLayout>
  );
}

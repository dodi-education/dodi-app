import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslations } from "use-intl";

import { AuthLayout } from "@/components/shared/auth-layout";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Text,
} from "@/components/ui";
import { useVaultStore } from "@/lib/client-state";

/**
 * When the silent device unlock fails (web: components/vault/vault-unlock-prompt):
 * a new device that needs the password (or the nsec account key), or an
 * account with no vault yet.
 */
export function VaultUnlockPrompt() {
  const t = useTranslations("vault");
  const router = useRouter();
  const status = useVaultStore((s) => s.status);
  const needsSetup = status === "needs-setup";
  const [mode, setMode] = useState<"password" | "nsec">("password");
  const [password, setPassword] = useState("");
  const [nsec, setNsec] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  async function submit(): Promise<void> {
    setIsBusy(true);
    setError(null);
    const vault = useVaultStore.getState();
    try {
      if (needsSetup) {
        await vault.bootstrap(password);
        router.replace("/vault-setup");
        return;
      }
      if (mode === "password") await vault.unlockWithPassword(password);
      else await vault.unlockWithNsec(nsec.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : t("unlockFailed"));
      setIsBusy(false);
    }
  }

  return (
    <AuthLayout>
      <Card>
        <CardHeader>
          <CardTitle>{needsSetup ? t("setupTitle") : t("unlockTitle")}</CardTitle>
          <CardDescription>
            {needsSetup
              ? t("setupDescription")
              : mode === "password"
                ? t("unlockPasswordDescription")
                : t("unlockNsecDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <View className="flex flex-col gap-4">
            {needsSetup || mode === "password" ? (
              <View className="flex flex-col gap-2">
                <Label>{t("passwordLabel")}</Label>
                <Input
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="current-password"
                  textContentType="password"
                  accessibilityLabel={t("passwordLabel")}
                  autoFocus
                  onSubmitEditing={() => void submit()}
                />
              </View>
            ) : (
              <View className="flex flex-col gap-2">
                <Label>{t("nsecLabel")}</Label>
                <Input
                  value={nsec}
                  onChangeText={setNsec}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={t("nsecPlaceholder")}
                  className="font-mono"
                  accessibilityLabel={t("nsecLabel")}
                  onSubmitEditing={() => void submit()}
                />
              </View>
            )}
            {error ? <Text className="text-sm text-destructive">{error}</Text> : null}
            <Button onPress={() => void submit()} disabled={isBusy} className="w-full">
              {isBusy ? t("unlocking") : needsSetup ? t("createVault") : t("unlock")}
            </Button>
          </View>
          {!needsSetup ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setMode(mode === "password" ? "nsec" : "password");
                setError(null);
              }}
              hitSlop={12}
              className="mt-3 w-full"
            >
              <Text className="text-center text-sm text-muted-foreground">
                {mode === "password" ? t("forgotPasswordUseKey") : t("usePasswordInstead")}
              </Text>
            </Pressable>
          ) : null}
        </CardContent>
      </Card>
    </AuthLayout>
  );
}

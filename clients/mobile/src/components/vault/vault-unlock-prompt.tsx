import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslations } from "use-intl";

import { Button, Notice, Screen, Text, TextField } from "@/components/ui";
import { useVaultStore } from "@/lib/client-state";

/**
 * When the silent device unlock fails: a new device that needs the password
 * (or the nsec account key), or an account with no vault yet.
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
    <Screen isCentered>
      <Text variant="title">{needsSetup ? t("setupTitle") : t("unlockTitle")}</Text>
      <Text variant="muted">
        {needsSetup
          ? t("setupDescription")
          : mode === "password"
            ? t("unlockPasswordDescription")
            : t("unlockNsecDescription")}
      </Text>
      {needsSetup || mode === "password" ? (
        <TextField
          label={t("passwordLabel")}
          value={password}
          onChangeText={setPassword}
          autoFocus
          textContentType="password"
          secure={{ showLabel: t("passwordLabel"), hideLabel: t("passwordLabel") }}
          onSubmitEditing={() => void submit()}
        />
      ) : (
        <TextField
          label={t("nsecLabel")}
          placeholder={t("nsecPlaceholder")}
          value={nsec}
          onChangeText={setNsec}
          autoCapitalize="none"
          autoCorrect={false}
          className="font-mono"
        />
      )}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Button
        label={isBusy ? t("unlocking") : needsSetup ? t("createVault") : t("unlock")}
        isLoading={isBusy}
        onPress={() => void submit()}
      />
      {!needsSetup ? (
        <Button
          variant="ghost"
          label={mode === "password" ? t("forgotPasswordUseKey") : t("usePasswordInstead")}
          onPress={() => {
            setMode(mode === "password" ? "nsec" : "password");
            setError(null);
          }}
        />
      ) : null}
    </Screen>
  );
}

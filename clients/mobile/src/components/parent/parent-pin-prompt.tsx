import { useState } from "react";
import { Image } from "react-native";
import { useTranslations } from "use-intl";

import { authClient } from "@/adapters/auth";
import { mobilePlatform } from "@/adapters/platform";
import { Button, Notice, Screen, Text, TextField } from "@/components/ui";
import { useAccountStore, useVaultStore } from "@/lib/client-state";

const PIN_LENGTH = 4;

/**
 * The parent PIN check: decrypt the stored PIN with the unlocked vault and
 * compare on the device; the server is never involved. "Forgot PIN" proves
 * the account password server-side instead (no new session).
 */
export function ParentPinPrompt() {
  const t = useTranslations("parentPin");
  const pinEnc = useAccountStore((s) => s.account?.parent_pin_enc ?? null);
  const [value, setValue] = useState("");
  const [isWrong, setIsWrong] = useState(false);
  const [isPasswordMode, setIsPasswordMode] = useState(false);
  const [password, setPassword] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  function verify(entered: string): void {
    const session = useVaultStore.getState().session;
    if (session && pinEnc && session.decryptField(pinEnc) === entered) {
      mobilePlatform.parentLock.markUnlocked();
      return;
    }
    setIsWrong(true);
    setValue("");
  }

  async function verifyPassword(): Promise<void> {
    setPasswordError(null);
    setIsBusy(true);
    try {
      const { data, error } = await authClient.$fetch<{ ok: boolean }>("/password/verify", {
        method: "POST",
        body: { password },
      });
      if (error || !data?.ok) setPasswordError(t("passwordWrong"));
      else mobilePlatform.parentLock.markUnlocked();
    } catch {
      setPasswordError(t("passwordWrong"));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <Screen isCentered className="items-center">
      <Image source={require("../../../assets/images/splash.png")} className="h-12 w-12" accessibilityIgnoresInvertColors />
      <Text variant="title" className="text-center">{t("promptTitle")}</Text>
      <Text variant="muted" className="text-center">{t("promptSubtitle")}</Text>
      <TextField
        label={t("promptTitle")}
        value={value}
        onChangeText={(next) => {
          const digits = next.replace(/\D/g, "").slice(0, PIN_LENGTH);
          setIsWrong(false);
          setValue(digits);
          if (digits.length === PIN_LENGTH) verify(digits);
        }}
        keyboardType="number-pad"
        maxLength={PIN_LENGTH}
        autoFocus
        secureTextEntry
        error={isWrong ? t("wrong") : null}
        className="text-center tracking-[1em]"
      />
      {isPasswordMode ? (
        <>
          <TextField
            label={t("passwordLabel")}
            value={password}
            onChangeText={(next) => {
              setPasswordError(null);
              setPassword(next);
            }}
            textContentType="password"
            secure={{ showLabel: t("passwordLabel"), hideLabel: t("passwordLabel") }}
          />
          {passwordError ? <Notice tone="danger">{passwordError}</Notice> : null}
          <Button
            label={isBusy ? t("checking") : t("unlock")}
            isLoading={isBusy}
            disabled={!password}
            onPress={() => void verifyPassword()}
          />
        </>
      ) : (
        <Button variant="ghost" label={t("forgot")} onPress={() => setIsPasswordMode(true)} />
      )}
    </Screen>
  );
}

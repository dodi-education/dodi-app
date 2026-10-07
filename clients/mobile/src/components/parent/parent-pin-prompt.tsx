import { useState } from "react";
import { Image, Pressable, View } from "react-native";
import { useTranslations } from "use-intl";

import { authClient } from "@/adapters/auth";
import { mobilePlatform } from "@/adapters/platform";
import { CenteredPage } from "@/components/auth/centered-page";
import { Button, Input, Label, PinInput, Text } from "@/components/ui";
import { useAccountStore, useVaultStore } from "@/lib/client-state";

/** The dodi head above the prompt (web: 48×48). */
const HEAD_SIZE = 48;

/**
 * The parent PIN check (web: components/parent/parent-pin-prompt): decrypt
 * the stored PIN with the unlocked vault and compare on the device; the
 * server is never involved. "Forgot PIN" proves the account password
 * server-side instead (no new session).
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
    <CenteredPage className="max-w-xs items-center" pageClassName="px-4">
      <Image
        source={require("../../../assets/images/splash.png")}
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={{ width: HEAD_SIZE, height: HEAD_SIZE }}
        accessibilityIgnoresInvertColors
      />
      <Text className="mt-4 text-center text-xl font-bold tracking-tight" accessibilityRole="header">
        {t("promptTitle")}
      </Text>
      <Text className="mt-1 text-center text-sm text-muted-foreground">{t("promptSubtitle")}</Text>

      <View className="mt-6 w-full">
        <PinInput
          value={value}
          onChange={(next) => {
            setIsWrong(false);
            setValue(next);
          }}
          onComplete={verify}
          isError={isWrong}
          autoFocus
          accessibilityLabel={t("promptTitle")}
        />
        {isWrong ? <Text className="mt-3 text-center text-sm text-destructive">{t("wrong")}</Text> : null}
      </View>

      {isPasswordMode ? (
        <View className="mt-6 w-full flex-col gap-3">
          <View className="flex flex-col gap-2">
            <Label>{t("passwordLabel")}</Label>
            <Input
              value={password}
              onChangeText={(next) => {
                setPasswordError(null);
                setPassword(next);
              }}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="current-password"
              textContentType="password"
              accessibilityLabel={t("passwordLabel")}
              onSubmitEditing={() => void verifyPassword()}
            />
          </View>
          {passwordError ? <Text className="text-sm text-destructive">{passwordError}</Text> : null}
          <Button onPress={() => void verifyPassword()} disabled={isBusy || !password}>
            {isBusy ? t("checking") : t("unlock")}
          </Button>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() => setIsPasswordMode(true)}
          hitSlop={14}
          className="mt-6"
        >
          <Text className="text-[13px] font-semibold text-muted-foreground">{t("forgot")}</Text>
        </Pressable>
      )}
    </CenteredPage>
  );
}

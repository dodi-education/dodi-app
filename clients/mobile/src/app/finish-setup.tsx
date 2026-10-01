import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";
import { finishSetup, validateFinishSetup } from "@dodi/client-state/finish-setup";

import { mobileAuthApi } from "@/adapters/auth";
import { Captcha, type CaptchaHandle, requestCaptchaToken } from "@/components/auth/captcha";
import { Button, Notice, Screen, Text, TextField } from "@/components/ui";
import { clientState } from "@/lib/client-state";
import { markSignedIn, signOut } from "@/lib/session";

/**
 * Safety net for a signed-in account without a vault (web: (auth)/finish-setup),
 * reached from VaultGate. It lives outside the (auth) group, which turns
 * signed-in parents away. The password is verified against the account before
 * the vault is derived from it, so the two stay in sync.
 */
export default function FinishSetupScreen() {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const captchaRef = useRef<CaptchaHandle>(null);

  useEffect(() => {
    void mobileAuthApi.sessionUser().then(async (user) => {
      if (!user) {
        // The stored token is dead: drop it, or sign-in would bounce back here.
        await signOut();
        router.replace("/login");
        return;
      }
      setEmail(user.email || null);
      setIsChecking(false);
    });
  }, [router]);

  async function submit(): Promise<void> {
    if (!email) return;
    setError(null);
    const invalid = validateFinishSetup(password);
    if (invalid) {
      setError(t(invalid));
      return;
    }
    setIsLoading(true);
    const captcha = await requestCaptchaToken(captchaRef.current);
    if (!captcha.ok) {
      setError(t("captchaUnavailable"));
      setIsLoading(false);
      return;
    }
    const outcome = await finishSetup(
      { auth: mobileAuthApi, vault: clientState.vault },
      { email, password, captchaToken: captcha.token },
    );
    if (outcome.kind === "error") {
      setError(t(outcome.key));
      setIsLoading(false);
      return;
    }
    router.replace(outcome.created ? "/vault-setup" : "/parent/dashboard");
    markSignedIn();
  }

  if (isChecking) {
    return (
      <Screen isCentered>
        <Text variant="title">{t("finishSetupTitle")}</Text>
        <Text variant="muted">{tc("loading")}</Text>
      </Screen>
    );
  }

  return (
    <Screen isCentered>
      <View className="gap-1">
        <Text variant="title">{t("finishSetupTitle")}</Text>
        <Text variant="muted">{t("finishSetupDescription")}</Text>
      </View>
      <TextField
        label={t("password")}
        placeholder={t("passwordPlaceholder")}
        value={password}
        onChangeText={setPassword}
        autoComplete="current-password"
        textContentType="password"
        secure={{ showLabel: t("showPassword"), hideLabel: t("hidePassword") }}
        autoFocus
        onSubmitEditing={() => void submit()}
      />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Captcha ref={captchaRef} action="sign-in" />
      <Button
        label={isLoading ? tc("loading") : t("finishSetupSubmit")}
        isLoading={isLoading}
        disabled={!password}
        onPress={() => void submit()}
      />
    </Screen>
  );
}

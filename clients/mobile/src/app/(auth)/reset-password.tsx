import { Link, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";
import {
  resendResetCode,
  sendResetCode,
  verifyResetCode,
} from "@dodi/client-state/password-reset";

import { mobileAuthApi } from "@/adapters/auth";
import { Captcha, type CaptchaHandle, requestCaptchaToken } from "@/components/auth/captcha";
import { VerifyCodeForm } from "@/components/auth/verify-code-form";
import { Button, Notice, Screen, Text, TextField } from "@/components/ui";

/**
 * Forgot password, step one (web: (auth)/reset-password): the email carries a
 * sign-in code; entering it signs the parent in on this device, and
 * update-password then sets the new password (and re-wraps the vault).
 */
export default function ResetPasswordScreen() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<"form" | "awaitingOtp">("form");
  // Sending and resending the code each need a fresh token.
  const captchaRef = useRef<CaptchaHandle>(null);

  async function submit(): Promise<void> {
    setError(null);
    setIsLoading(true);
    const captcha = await requestCaptchaToken(captchaRef.current);
    if (!captcha.ok) {
      setError(t("captchaUnavailable"));
      setIsLoading(false);
      return;
    }
    const failure = await sendResetCode(mobileAuthApi, {
      email: email.trim(),
      captchaToken: captcha.token,
    });
    setIsLoading(false);
    if (failure) {
      setError(t(failure));
      return;
    }
    setStep("awaitingOtp");
  }

  const backToSignIn = (
    <Link href="/login" asChild>
      <Button variant="ghost" label={t("backToSignIn")} />
    </Link>
  );

  if (step === "awaitingOtp") {
    return (
      <Screen isCentered>
        <VerifyCodeForm
          description={t("enterCodeResetDescription", { email: email.trim() })}
          onVerify={async (code) => {
            const key = await verifyResetCode(mobileAuthApi, { email: email.trim(), code });
            if (key) return t(key);
            // Signed in (the bearer is stored): on to the new password. The
            // session is marked only once that is set, so the signed-out area
            // keeps hosting update-password.
            router.replace("/update-password");
            return null;
          }}
          onResend={async () => {
            const captcha = await requestCaptchaToken(captchaRef.current);
            if (!captcha.ok) return t("captchaUnavailable");
            const key = await resendResetCode(mobileAuthApi, {
              email: email.trim(),
              captchaToken: captcha.token,
            });
            return key ? t(key) : null;
          }}
          onBack={() => {
            setStep("form");
            setError(null);
          }}
        >
          <Captcha ref={captchaRef} action="reset-password" />
        </VerifyCodeForm>
        {backToSignIn}
      </Screen>
    );
  }

  return (
    <Screen isCentered>
      <View className="gap-1">
        <Text variant="title">{t("resetPasswordTitle")}</Text>
        <Text variant="muted">{t("resetPasswordDescription")}</Text>
      </View>
      <TextField
        label={t("email")}
        placeholder={t("emailPlaceholder")}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="username"
        onSubmitEditing={() => void submit()}
      />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Captcha ref={captchaRef} action="reset-password" />
      <Button
        label={isLoading ? t("sending") : t("sendResetCode")}
        isLoading={isLoading}
        disabled={!email.trim()}
        onPress={() => void submit()}
      />
      {backToSignIn}
    </Screen>
  );
}

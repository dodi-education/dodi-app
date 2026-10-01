import { Link, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";
import { resendCode, signIn, type SignInOutcome, verifySignInCode } from "@dodi/client-state";

import { Captcha, type CaptchaHandle, requestCaptchaToken } from "@/components/auth/captcha";
import { VerifyCodeForm } from "@/components/auth/verify-code-form";
import { Button, Notice, Screen, Text, TextField } from "@/components/ui";
import { mobileAuthApi } from "@/adapters/auth";
import { authDeps } from "@/lib/auth-deps";
import { markSignedIn } from "@/lib/session";

/** Email + password sign-in (web: (auth)/login). The vault opens with the same password. */
export default function LoginScreen() {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // An account that never confirmed its email gets a fresh code on sign-in.
  const [step, setStep] = useState<"form" | "awaitingOtp">("form");
  const captchaRef = useRef<CaptchaHandle>(null);

  /** Act on an outcome; returns a message to show, or null. */
  function handleOutcome(outcome: SignInOutcome): string | null {
    if (outcome.kind === "needs_code") {
      setStep("awaitingOtp");
      setIsLoading(false);
      return null;
    }
    if (outcome.kind === "error") {
      if (outcome.key === "unlockAfterLoginFailed") setStep("form");
      setIsLoading(false);
      return outcome.key ? t(outcome.key) : (outcome.message ?? "");
    }
    // The account's saved language is applied by the locale provider.
    router.replace(outcome.isNewVault ? "/vault-setup" : "/parent/dashboard");
    markSignedIn();
    return null;
  }

  async function submit(): Promise<void> {
    setError(null);
    setIsLoading(true);
    const captcha = await requestCaptchaToken(captchaRef.current);
    if (!captcha.ok) {
      setError(t("captchaUnavailable"));
      setIsLoading(false);
      return;
    }
    const message = handleOutcome(
      await signIn(authDeps, { email: email.trim(), password, captchaToken: captcha.token }),
    );
    if (message !== null) setError(message);
  }

  if (step === "awaitingOtp") {
    return (
      <Screen isCentered>
        <VerifyCodeForm
          description={t("enterCodeDescription", { email })}
          onVerify={async (code) => {
            const outcome = await verifySignInCode(authDeps, { email: email.trim(), password, code });
            if (outcome.kind === "error" && outcome.key !== "unlockAfterLoginFailed") {
              return outcome.key ? t(outcome.key) : (outcome.message ?? "");
            }
            const message = handleOutcome(outcome);
            if (message !== null) setError(message);
            return null;
          }}
          onResend={async () => {
            const captcha = await requestCaptchaToken(captchaRef.current);
            if (!captcha.ok) return t("captchaUnavailable");
            const key = await resendCode(mobileAuthApi, { email: email.trim(), captchaToken: captcha.token });
            return key ? t(key) : null;
          }}
          onBack={() => {
            setStep("form");
            setError(null);
          }}
        >
          <Captcha ref={captchaRef} action="sign-in" />
        </VerifyCodeForm>
      </Screen>
    );
  }

  return (
    <Screen isCentered>
      <View className="gap-1">
        <Text variant="title">{t("welcomeBack")}</Text>
        <Text variant="muted">{t("signInDescription")}</Text>
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
      />
      <TextField
        label={t("password")}
        value={password}
        onChangeText={setPassword}
        autoComplete="current-password"
        textContentType="password"
        secure={{ showLabel: t("showPassword"), hideLabel: t("hidePassword") }}
        onSubmitEditing={() => void submit()}
      />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Captcha ref={captchaRef} action="sign-in" />
      <Button
        label={isLoading ? t("signingIn") : tc("signIn")}
        isLoading={isLoading}
        disabled={!email || !password}
        onPress={() => void submit()}
      />
      <Link href="/reset-password" asChild>
        <Button variant="ghost" label={t("forgotPassword")} />
      </Link>
      <View className="flex-row flex-wrap items-center justify-center gap-1">
        <Text variant="muted">{t("noAccount")}</Text>
        <Link href="/register" asChild>
          <Button variant="ghost" label={t("createAccount")} />
        </Link>
      </View>
    </Screen>
  );
}

import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";
import { resendCode, signIn, type SignInOutcome, verifySignInCode } from "@dodi/client-state";

import { Captcha, type CaptchaHandle, requestCaptchaToken } from "@/components/auth/captcha";
import { VerifyCodeForm } from "@/components/auth/verify-code-form";
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
  PasswordInput,
  Text,
} from "@/components/ui";
import { mobileAuthApi } from "@/adapters/auth";
import { authDeps } from "@/lib/auth-deps";
import { markSignedIn } from "@/lib/session";

/** Email + password sign-in (web: (auth)/login). The vault opens with the same password. */
export default function LoginScreen() {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const router = useRouter();
  // Set by Settings > Delete account after the account is gone.
  const params = useLocalSearchParams<{ deleted?: string; next?: string }>();
  const isAccountDeleted = params.deleted === "1";
  // Deep link to return to after sign-in (e.g. an agent approval link); same-app paths only.
  const next = typeof params.next === "string" && /^\/(parent|authorize)(\/|\?|$)/.test(params.next) ? params.next : null;
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
    router.replace(outcome.isNewVault ? "/vault-setup" : ((next ?? "/parent/dashboard") as "/parent/dashboard"));
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

  return (
    <AuthLayout>
      <Card>
        <CardHeader>
          <CardTitle>{t("welcomeBack")}</CardTitle>
          <CardDescription>{t("signInDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {step === "awaitingOtp" ? (
            <VerifyCodeForm
              description={t("enterCodeDescription", { email })}
              onVerify={async (code) => {
                const outcome = await verifySignInCode(authDeps, { email: email.trim(), password, code });
                // Wrong / expired codes stay on the code step; a vault failure goes back.
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
          ) : (
            <View className="flex flex-col gap-4">
              {isAccountDeleted ? (
                <View accessibilityRole="alert" className="rounded-lg bg-success-soft px-3 py-2">
                  <Text className="text-sm text-success">{t("accountDeleted")}</Text>
                </View>
              ) : null}
              <View className="flex flex-col gap-2">
                <Label>{t("email")}</Label>
                <Input
                  placeholder={t("emailPlaceholder")}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  textContentType="username"
                  accessibilityLabel={t("email")}
                />
              </View>
              <View className="flex flex-col gap-2">
                <Label>{t("password")}</Label>
                <PasswordInput
                  value={password}
                  onChangeText={setPassword}
                  autoComplete="current-password"
                  textContentType="password"
                  accessibilityLabel={t("password")}
                  onSubmitEditing={() => void submit()}
                  showPasswordLabel={t("showPassword")}
                  hidePasswordLabel={t("hidePassword")}
                />
              </View>
              {error ? <Text className="text-sm text-destructive">{error}</Text> : null}
              <Captcha ref={captchaRef} action="sign-in" />
              <Button
                onPress={() => void submit()}
                disabled={isLoading || !email || !password}
                className="w-full"
              >
                {isLoading ? t("signingIn") : tc("signIn")}
              </Button>
            </View>
          )}
        </CardContent>
        <CardFooter className="flex-col gap-2">
          <Link href="/reset-password" asChild>
            <Text accessibilityRole="link" className="text-sm text-muted-foreground">
              {t("forgotPassword")}
            </Text>
          </Link>
          <Text className="text-sm text-muted-foreground">
            {t("noAccount")}{" "}
            <Link href="/register" asChild>
              <Text accessibilityRole="link" className="text-sm font-medium text-primary">
                {tc("signUp")}
              </Text>
            </Link>
          </Text>
        </CardFooter>
      </Card>
    </AuthLayout>
  );
}

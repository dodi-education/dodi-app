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
    <CardFooter>
      <Link href="/login" asChild>
        <Text accessibilityRole="link" className="text-sm text-muted-foreground">
          {t("backToSignIn")}
        </Text>
      </Link>
    </CardFooter>
  );

  if (step === "awaitingOtp") {
    return (
      <AuthLayout>
        <Card>
          <CardHeader>
            <CardTitle>{t("enterCodeTitle")}</CardTitle>
            <CardDescription>{t("enterCodeResetDescription", { email: email.trim() })}</CardDescription>
          </CardHeader>
          <CardContent>
            <VerifyCodeForm
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
          </CardContent>
          {backToSignIn}
        </Card>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <Card>
        <CardHeader>
          <CardTitle>{t("resetPasswordTitle")}</CardTitle>
          <CardDescription>{t("resetPasswordDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <View className="flex flex-col gap-4">
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
                onSubmitEditing={() => void submit()}
              />
            </View>
            {error ? <Text className="text-sm text-destructive">{error}</Text> : null}
            <Captcha ref={captchaRef} action="reset-password" />
            <Button onPress={() => void submit()} disabled={isLoading || !email.trim()} className="w-full">
              {isLoading ? t("sending") : t("sendResetCode")}
            </Button>
          </View>
        </CardContent>
        {backToSignIn}
      </Card>
    </AuthLayout>
  );
}

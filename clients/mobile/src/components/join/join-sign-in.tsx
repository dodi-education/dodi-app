import { useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslations } from "use-intl";
import { resendCode } from "@dodi/client-state";
import {
  signInToJoin,
  verifyJoinCode,
  type InvitationPreview,
} from "@dodi/client-state/family-members";

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

import { useFinishJoin } from "./use-join";

/** The invited address already has a login: sign in with it, then join (web: auth/join/join-sign-in). */
export function JoinSignIn({
  invitation,
  secret,
  intro,
  onCreateAccount,
}: {
  invitation: InvitationPreview;
  secret: string;
  intro: string;
  onCreateAccount: () => void;
}) {
  const t = useTranslations("join");
  const tAuth = useTranslations("auth");
  const finish = useFinishJoin(invitation.id, secret);
  const email = invitation.invitedEmail;
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [step, setStep] = useState<"form" | "code">("form");
  const captchaRef = useRef<CaptchaHandle>(null);

  async function signIn(): Promise<void> {
    setError(null);
    setIsBusy(true);
    const captcha = await requestCaptchaToken(captchaRef.current);
    if (!captcha.ok) {
      setError(tAuth("captchaUnavailable"));
      setIsBusy(false);
      return;
    }
    const outcome = await signInToJoin(mobileAuthApi, { email, password, captchaToken: captcha.token });
    if (outcome.kind === "needs_code") {
      setIsBusy(false);
      setStep("code");
      return;
    }
    if (outcome.kind === "error") {
      setError(outcome.key ? tAuth(outcome.key) : (outcome.message ?? ""));
      setIsBusy(false);
      return;
    }
    setError(await finish(password));
    setIsBusy(false);
  }

  if (step === "code") {
    return (
      <AuthLayout>
        <Card>
          <CardHeader>
            <CardTitle>{tAuth("enterCodeTitle")}</CardTitle>
            <CardDescription>{tAuth("enterCodeDescription", { email })}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <VerifyCodeForm
              onVerify={async (code) => {
                const failure = await verifyJoinCode(mobileAuthApi, { email, code });
                return failure ? tAuth(failure) : finish(password);
              }}
              onResend={async () => {
                const captcha = await requestCaptchaToken(captchaRef.current);
                if (!captcha.ok) return tAuth("captchaUnavailable");
                const failure = await resendCode(mobileAuthApi, { email, captchaToken: captcha.token });
                return failure ? tAuth(failure) : null;
              }}
              onBack={() => setStep("form")}
            >
              <Captcha ref={captchaRef} action="sign-in" />
            </VerifyCodeForm>
          </CardContent>
        </Card>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{intro}</CardDescription>
        </CardHeader>
        <CardContent>
          <View className="flex flex-col gap-4">
            <View className="flex flex-col gap-2">
              <Label>{tAuth("email")}</Label>
              <Input value={email} editable={false} accessibilityLabel={tAuth("email")} />
            </View>
            <View className="flex flex-col gap-2">
              <Label>{tAuth("password")}</Label>
              <Input
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="current-password"
                textContentType="password"
                accessibilityLabel={tAuth("password")}
                autoFocus
                onSubmitEditing={() => void signIn()}
              />
            </View>
            {error ? (
              <Text accessibilityRole="alert" className="text-sm text-destructive">
                {error}
              </Text>
            ) : null}
            <Captcha ref={captchaRef} action="sign-in" />
            <Button className="w-full" disabled={isBusy || !password} onPress={() => void signIn()}>
              {isBusy ? t("joining") : t("signInAndJoin")}
            </Button>
          </View>
        </CardContent>
        <CardFooter>
          <Pressable accessibilityRole="button" onPress={onCreateAccount} hitSlop={12}>
            <Text className="text-sm font-medium text-primary">{t("needAccount")}</Text>
          </Pressable>
        </CardFooter>
      </Card>
    </AuthLayout>
  );
}

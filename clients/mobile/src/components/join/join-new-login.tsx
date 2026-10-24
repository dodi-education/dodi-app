import { useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslations } from "use-intl";
import { resendCode } from "@dodi/client-state";
import {
  startJoinRegistration,
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

import { JoinTerms } from "./join-terms";
import { useFinishJoin } from "./use-join";

/**
 * A new login for the invited address (web: auth/join/join-new-login): no
 * family of its own, it joins the inviting one once the emailed code confirms
 * the address. The password stays in memory until then.
 */
export function JoinNewLogin({
  invitation,
  secret,
  intro,
  onHaveAccount,
}: {
  invitation: InvitationPreview;
  secret: string;
  intro: string;
  onHaveAccount: () => void;
}) {
  const t = useTranslations("join");
  const tAuth = useTranslations("auth");
  const finish = useFinishJoin(invitation.id, secret);
  const email = invitation.invitedEmail;
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [step, setStep] = useState<"form" | "code">("form");
  const captchaRef = useRef<CaptchaHandle>(null);

  async function register(): Promise<void> {
    setError(null);
    setIsBusy(true);
    const captcha = await requestCaptchaToken(captchaRef.current);
    if (!captcha.ok) {
      setError(tAuth("captchaUnavailable"));
      setIsBusy(false);
      return;
    }
    const failure = await startJoinRegistration(mobileAuthApi, {
      email,
      password,
      confirmPassword,
      invitationId: invitation.id,
      hasAcceptedTerms,
      captchaToken: captcha.token,
    });
    setIsBusy(false);
    if (failure === "invitationInvalid") setError(t("joinUsed"));
    else if (failure) setError(tAuth(failure));
    else setStep("code");
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
              <Captcha ref={captchaRef} action="sign-up" />
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
                autoComplete="new-password"
                textContentType="newPassword"
                accessibilityLabel={tAuth("password")}
              />
            </View>
            <View className="flex flex-col gap-2">
              <Label>{tAuth("confirmPassword")}</Label>
              <Input
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
                accessibilityLabel={tAuth("confirmPassword")}
              />
            </View>
            <JoinTerms isAccepted={hasAcceptedTerms} onChange={setHasAcceptedTerms} />
            {error ? (
              <Text accessibilityRole="alert" className="text-sm text-destructive">
                {error}
              </Text>
            ) : null}
            <Captcha ref={captchaRef} action="sign-up" />
            <Button className="w-full" disabled={isBusy} onPress={() => void register()}>
              {isBusy ? tAuth("creatingAccount") : t("createAndJoin")}
            </Button>
          </View>
        </CardContent>
        <CardFooter>
          <Pressable accessibilityRole="button" onPress={onHaveAccount} hitSlop={12}>
            <Text className="text-sm font-medium text-primary">{t("haveAccount")}</Text>
          </Pressable>
        </CardFooter>
      </Card>
    </AuthLayout>
  );
}

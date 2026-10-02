import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";
import { finishSetup, validateFinishSetup } from "@dodi/client-state/finish-setup";

import { mobileAuthApi } from "@/adapters/auth";
import { Captcha, type CaptchaHandle, requestCaptchaToken } from "@/components/auth/captcha";
import { AuthLayout } from "@/components/shared/auth-layout";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Text,
} from "@/components/ui";
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
      <AuthLayout>
        <Card>
          <CardHeader>
            <CardTitle>{t("finishSetupTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Text className="text-sm text-muted-foreground">{tc("loading")}</Text>
          </CardContent>
        </Card>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <Card>
        <CardHeader>
          <CardTitle>{t("finishSetupTitle")}</CardTitle>
          <CardDescription>{t("finishSetupDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <View className="flex flex-col gap-4">
            <View className="flex flex-col gap-2">
              <Label>{t("password")}</Label>
              <Input
                placeholder={t("passwordPlaceholder")}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="current-password"
                textContentType="password"
                accessibilityLabel={t("password")}
                autoFocus
                onSubmitEditing={() => void submit()}
              />
            </View>
            {error ? <Text className="text-sm text-destructive">{error}</Text> : null}
            <Captcha ref={captchaRef} action="sign-in" />
            <Button onPress={() => void submit()} disabled={isLoading || !password} className="w-full">
              {isLoading ? tc("loading") : t("finishSetupSubmit")}
            </Button>
          </View>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}

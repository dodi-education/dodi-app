import { Link, useRouter } from "expo-router";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { useTranslations } from "use-intl";
import {
  type FinishRegistrationOutcome,
  finalizeRegistration,
  type RegistrationMode,
  resendCode,
  startRegistration,
  validateRegistration,
  verifyRegistrationCode,
} from "@dodi/client-state";
import { legalUrl, type LegalPage } from "@dodi/client-state/legal-links";

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
  Icon,
  Input,
  Label,
  Text,
} from "@/components/ui";
import { authDeps, isNpubConflict } from "@/lib/auth-deps";
import { clientState } from "@/lib/client-state";
import { cn } from "@/lib/cn";
import { SITE_URL } from "@/lib/env";
import { useLocaleSetting } from "@/lib/intl";
import { markSignedIn } from "@/lib/session";

/**
 * Registration (web: (auth)/register). The vault is built and sealed on this
 * device while the password is in hand, and persisted only once the emailed
 * code established a session.
 */
export default function RegisterScreen() {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const { locale } = useLocaleSetting();
  const router = useRouter();
  const [mode, setMode] = useState<RegistrationMode | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [isImportingNsec, setIsImportingNsec] = useState(false);
  const [importedNsec, setImportedNsec] = useState("");
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<"form" | "awaitingOtp">("form");
  // The code was consumed but persisting failed: retry the persist, not the code.
  const [isFinalizeRetry, setIsFinalizeRetry] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const captchaRef = useRef<CaptchaHandle>(null);

  useEffect(() => {
    void mobileAuthApi.registrationMode().then(setMode);
  }, []);

  async function submit(): Promise<void> {
    setError(null);
    const form = {
      email: email.trim(),
      password,
      confirmPassword,
      mode: mode ?? "open",
      inviteCode,
      importedNsec: isImportingNsec ? importedNsec : "",
      hasAcceptedTerms,
    } as const;
    const invalid = validateRegistration(form);
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
    const failure = await startRegistration(authDeps, { ...form, captchaToken: captcha.token });
    setIsLoading(false);
    if (failure) {
      setError(t(failure));
      return;
    }
    setPassword("");
    setConfirmPassword("");
    setStep("awaitingOtp");
  }

  /** Message to show, or null when on to the account key. */
  function handleFinish(outcome: FinishRegistrationOutcome): string | null {
    if (outcome.kind === "done") {
      router.replace("/vault-setup");
      markSignedIn();
      return null;
    }
    if (outcome.kind === "retry_finalize") setIsFinalizeRetry(true);
    return t(outcome.key);
  }

  async function backToForm(): Promise<void> {
    await clientState.vault.getState().discardLocalVault();
    setStep("form");
    setError(null);
    setIsFinalizeRetry(false);
  }

  /** A policy link inside the consent sentence (nested text, so it wraps with it). */
  function legalLink(page: LegalPage, chunks: ReactNode): ReactNode {
    return (
      <Text
        key={page}
        accessibilityRole="link"
        onPress={() => void Linking.openURL(legalUrl(SITE_URL, page, locale))}
        className="text-sm font-medium text-primary"
      >
        {chunks}
      </Text>
    );
  }

  const signInFooter = (
    <CardFooter>
      <Text className="text-sm text-muted-foreground">
        {t("alreadyHaveAccount")}{" "}
        <Link href="/login" asChild>
          <Text accessibilityRole="link" className="text-sm font-medium text-primary">
            {tc("signIn")}
          </Text>
        </Link>
      </Text>
    </CardFooter>
  );

  if (mode === null) {
    return (
      <AuthLayout>
        <Card>
          <CardHeader>
            <CardTitle>{t("createAccountTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Text className="text-sm text-muted-foreground">{t("loadingRegistration")}</Text>
          </CardContent>
        </Card>
      </AuthLayout>
    );
  }

  if (step === "awaitingOtp") {
    return (
      <AuthLayout>
        <Card>
          <CardHeader>
            <CardTitle>{t("enterCodeTitle")}</CardTitle>
            <CardDescription>{t("enterCodeDescription", { email })}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {isFinalizeRetry ? (
              <>
                {error ? <Text className="text-sm text-destructive">{error}</Text> : null}
                <Button
                  onPress={async () => {
                    setIsFinalizing(true);
                    setError(null);
                    const message = handleFinish(
                      await finalizeRegistration(clientState.vault, isNpubConflict),
                    );
                    if (message !== null) setError(message);
                    setIsFinalizing(false);
                  }}
                  disabled={isFinalizing}
                  className="w-full"
                >
                  {isFinalizing ? tc("loading") : t("tryAgain")}
                </Button>
              </>
            ) : (
              <VerifyCodeForm
                onVerify={async (code) => {
                  const message = handleFinish(
                    await verifyRegistrationCode(authDeps, { email: email.trim(), code }, isNpubConflict),
                  );
                  // A consumed code with a failed persist moves to the retry above.
                  if (message !== null) setError(message);
                  return message;
                }}
                onResend={async () => {
                  const captcha = await requestCaptchaToken(captchaRef.current);
                  if (!captcha.ok) return t("captchaUnavailable");
                  const key = await resendCode(mobileAuthApi, {
                    email: email.trim(),
                    captchaToken: captcha.token,
                  });
                  return key ? t(key) : null;
                }}
                onBack={() => void backToForm()}
              >
                <Captcha ref={captchaRef} action="sign-up" />
              </VerifyCodeForm>
            )}
          </CardContent>
          {signInFooter}
        </Card>
      </AuthLayout>
    );
  }

  if (mode === "closed") {
    return (
      <AuthLayout>
        <Card>
          <CardHeader>
            <CardTitle>{t("registrationClosedTitle")}</CardTitle>
            <CardDescription>{t("registrationClosed")}</CardDescription>
          </CardHeader>
          {signInFooter}
        </Card>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <Card>
        <CardHeader>
          <CardTitle>{t("createAccountTitle")}</CardTitle>
          <CardDescription>{t("createAccountDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <View className="flex flex-col gap-4">
            {mode === "invite" ? (
              <View className="flex flex-col gap-2">
                <Label>{t("inviteCode")}</Label>
                <Input
                  placeholder={t("inviteCodePlaceholder")}
                  value={inviteCode}
                  onChangeText={setInviteCode}
                  autoCapitalize="none"
                  accessibilityLabel={t("inviteCode")}
                />
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
              <Input
                placeholder={t("passwordPlaceholder")}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
                accessibilityLabel={t("password")}
              />
            </View>
            <View className="flex flex-col gap-2">
              <Label>{t("confirmPassword")}</Label>
              <Input
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
                accessibilityLabel={t("confirmPassword")}
              />
            </View>
            {/* The web's <details>: a disclosure line, the field below it when open. */}
            <View>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: isImportingNsec }}
                onPress={() => setIsImportingNsec((open) => !open)}
                hitSlop={12}
                className="flex-row items-center gap-1 self-start"
              >
                <Icon
                  name={isImportingNsec ? "chevron_down" : "chevron_right"}
                  size={14}
                  color="muted-foreground"
                />
                <Text className="text-sm text-muted-foreground">{t("importNsecToggle")}</Text>
              </Pressable>
              {isImportingNsec ? (
                <View className="mt-3 flex flex-col gap-2">
                  <Label>{t("importNsecLabel")}</Label>
                  <Input
                    value={importedNsec}
                    onChangeText={setImportedNsec}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={t("accountKeyPlaceholder")}
                    className="font-mono"
                    accessibilityLabel={t("importNsecLabel")}
                  />
                  <Text className="text-xs text-muted-foreground">{t("importNsecHint")}</Text>
                </View>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: hasAcceptedTerms }}
              onPress={() => {
                setError(null);
                setHasAcceptedTerms((v) => !v);
              }}
              hitSlop={12}
              className="flex-row items-start gap-2"
            >
              <View
                className={cn(
                  "mt-0.5 size-4 shrink-0 items-center justify-center rounded-[4px] border",
                  hasAcceptedTerms ? "border-primary bg-primary" : "border-border-strong bg-card",
                )}
              >
                {hasAcceptedTerms ? (
                  <Icon name="check" size={12} stroke={3} color="primary-foreground" />
                ) : null}
              </View>
              <Text className="flex-1 text-sm text-ink-2">
                {t.rich("termsConsent", {
                  terms: (chunks) => legalLink("terms", chunks),
                  privacy: (chunks) => legalLink("privacy", chunks),
                })}
              </Text>
            </Pressable>
            {error ? <Text className="text-sm text-destructive">{error}</Text> : null}
            <Captcha ref={captchaRef} action="sign-up" />
            <Button onPress={() => void submit()} disabled={isLoading} className="w-full">
              {isLoading ? t("creatingAccount") : t("createAccount")}
            </Button>
          </View>
        </CardContent>
        {signInFooter}
      </Card>
    </AuthLayout>
  );
}

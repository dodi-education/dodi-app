import { Link, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
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

import { mobileAuthApi } from "@/adapters/auth";
import { Captcha, type CaptchaHandle, requestCaptchaToken } from "@/components/auth/captcha";
import { VerifyCodeForm } from "@/components/auth/verify-code-form";
import { Button, Notice, Screen, SwitchRow, Text, TextField } from "@/components/ui";
import { authDeps, isNpubConflict } from "@/lib/auth-deps";
import { clientState } from "@/lib/client-state";
import { markSignedIn } from "@/lib/session";

/**
 * Registration (web: (auth)/register). The vault is built and sealed on this
 * device while the password is in hand, and persisted only once the emailed
 * code established a session.
 */
export default function RegisterScreen() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [mode, setMode] = useState<RegistrationMode | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [isImportingNsec, setIsImportingNsec] = useState(false);
  const [importedNsec, setImportedNsec] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<"form" | "awaitingOtp">("form");
  // The code was consumed but persisting failed: retry the persist, not the code.
  const [isFinalizeRetry, setIsFinalizeRetry] = useState(false);
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

  if (mode === null) {
    return (
      <Screen isCentered>
        <Text variant="title">{t("createAccountTitle")}</Text>
        <Text variant="muted">{t("loadingRegistration")}</Text>
      </Screen>
    );
  }

  if (mode === "closed") {
    return (
      <Screen isCentered>
        <Text variant="title">{t("registrationClosedTitle")}</Text>
        <Text variant="muted">{t("registrationClosed")}</Text>
        <Link href="/login" asChild>
          <Button variant="secondary" label={t("backToSignIn")} />
        </Link>
      </Screen>
    );
  }

  if (step === "awaitingOtp") {
    return (
      <Screen isCentered>
        {isFinalizeRetry ? (
          <>
            <Notice tone="danger">{t("vaultSetupFailed")}</Notice>
            <Button
              label={t("tryAgain")}
              onPress={async () => {
                const message = handleFinish(
                  await finalizeRegistration(clientState.vault, isNpubConflict),
                );
                if (message !== null) setError(message);
              }}
            />
            {error ? <Notice tone="danger">{error}</Notice> : null}
          </>
        ) : (
          <VerifyCodeForm
            description={t("enterCodeDescription", { email })}
            onVerify={async (code) =>
              handleFinish(
                await verifyRegistrationCode(authDeps, { email: email.trim(), code }, isNpubConflict),
              )
            }
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
      </Screen>
    );
  }

  const secure = { showLabel: t("showPassword"), hideLabel: t("hidePassword") };
  return (
    <Screen isCentered>
      <View className="gap-1">
        <Text variant="title">{t("createAccountTitle")}</Text>
        <Text variant="muted">{t("createAccountDescription")}</Text>
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
        placeholder={t("passwordPlaceholder")}
        value={password}
        onChangeText={setPassword}
        autoComplete="new-password"
        textContentType="newPassword"
        secure={secure}
      />
      <TextField
        label={t("confirmPassword")}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        autoComplete="new-password"
        textContentType="newPassword"
        secure={secure}
      />
      {mode === "invite" ? (
        <TextField
          label={t("inviteCode")}
          placeholder={t("inviteCodePlaceholder")}
          value={inviteCode}
          onChangeText={setInviteCode}
          autoCapitalize="none"
        />
      ) : null}
      <SwitchRow label={t("importNsecToggle")} value={isImportingNsec} onValueChange={setIsImportingNsec} />
      {isImportingNsec ? (
        <TextField
          label={t("importNsecLabel")}
          hint={t("importNsecHint")}
          value={importedNsec}
          onChangeText={setImportedNsec}
          autoCapitalize="none"
          autoCorrect={false}
          secure={secure}
        />
      ) : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Captcha ref={captchaRef} action="sign-up" />
      <Button
        label={isLoading ? t("creatingAccount") : t("createAccount")}
        isLoading={isLoading}
        onPress={() => void submit()}
      />
      <View className="flex-row flex-wrap items-center justify-center gap-1">
        <Text variant="muted">{t("alreadyHaveAccount")}</Text>
        <Link href="/login" asChild>
          <Button variant="ghost" label={t("backToSignIn")} />
        </Link>
      </View>
    </Screen>
  );
}

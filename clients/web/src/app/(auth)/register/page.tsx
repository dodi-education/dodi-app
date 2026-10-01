"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import {
  Captcha,
  type CaptchaHandle,
  requestCaptchaToken,
} from "@/components/auth/captcha";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PinInput } from "@/components/ui/pin-input";
import {
  finalizeRegistration,
  type FinishRegistrationOutcome,
  RESEND_COOLDOWN_SECONDS,
  type RegistrationMode,
  resendCode,
  startRegistration,
  validateRegistration,
  verifyRegistrationCode,
} from "@dodi/client-state";
import { NpubConflictError } from "@dodi/protocol/client";
import { webAuthApi } from "@/lib/auth/auth-api";
import { clientState } from "@/lib/client-state";

const isNpubConflict = (error: unknown): boolean => error instanceof NpubConflictError;

export default function RegisterPage() {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const router = useRouter();
  // null = still loading the registration mode from the platform.
  const [mode, setMode] = useState<RegistrationMode | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  // Advanced: bring an existing Nostr key as the account key (empty = generate).
  const [importedNsec, setImportedNsec] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Email-OTP sub-step: after /register accepts the sign-up we stay in-page and
  // ask for the emailed code, then finalize the vault. All client state — no
  // navigation — so the middleware reverse-guard never bounces the still-
  // unauthenticated step.
  const [step, setStep] = useState<"form" | "awaitingOtp">("form");
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  // verifyOtp succeeded (code consumed) but finalizeVault failed → re-entering a
  // code is pointless; offer a plain retry of the persist step instead.
  const [finalizeError, setFinalizeError] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendInfo, setResendInfo] = useState<string | null>(null);
  // Turnstile widget of the current step: the sign-up POST and every code
  // resend each need a fresh token.
  const captchaRef = useRef<CaptchaHandle>(null);

  useEffect(() => {
    let cancelled = false;
    void webAuthApi.registrationMode().then((next) => {
      if (!cancelled) setMode(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Tick the resend cooldown down to zero.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendCooldown]);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const form = {
      email,
      password,
      confirmPassword,
      mode: mode ?? "open",
      inviteCode,
      importedNsec,
    } as const;
    // The challenge only runs once the form itself is valid.
    const invalid = validateRegistration(form);
    if (invalid) {
      setError(t(invalid));
      return;
    }
    setLoading(true);

    const captcha = await requestCaptchaToken(captchaRef);
    if (!captcha.ok) {
      setError(t("captchaUnavailable"));
      setLoading(false);
      return;
    }

    // Validates, registers (the platform emails the code and answers ok for
    // any well-formed email, so nothing leaks account existence), then builds
    // and seals the vault on this device while the password is in hand.
    const failure = await startRegistration(
      { auth: webAuthApi, vault: clientState.vault },
      { ...form, captchaToken: captcha.token },
    );
    if (failure) {
      setError(t(failure));
      setLoading(false);
      return;
    }
    setPassword("");
    setConfirmPassword("");
    setStep("awaitingOtp");
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    setLoading(false);
  }

  /** Act on the code step's outcome: on to the account key, or show why not. */
  function handleFinish(outcome: FinishRegistrationOutcome) {
    if (outcome.kind === "done") {
      router.push("/vault-setup");
      router.refresh();
      // Navigation unmounts this page; leave `verifying` set.
      return;
    }
    // A consumed code with a failed persist: re-entering a code is pointless,
    // so offer a plain retry of the persist step instead.
    if (outcome.kind === "retry_finalize") setFinalizeError(true);
    setOtpError(t(outcome.key));
    setVerifying(false);
  }

  async function finalize() {
    setVerifying(true);
    setOtpError(null);
    handleFinish(await finalizeRegistration(clientState.vault, isNpubConflict));
  }

  async function handleVerify(code: string) {
    if (code.length < 6 || verifying) return;
    setVerifying(true);
    setOtpError(null);
    const outcome = await verifyRegistrationCode(
      { auth: webAuthApi, vault: clientState.vault },
      { email, code },
      isNpubConflict,
    );
    if (outcome.kind === "error" && outcome.key !== "nsecTaken") setOtp("");
    handleFinish(outcome);
  }

  async function handleResend() {
    if (resendCooldown > 0) return;
    setOtpError(null);
    setResendInfo(null);
    const captcha = await requestCaptchaToken(captchaRef);
    if (!captcha.ok) {
      setOtpError(t("captchaUnavailable"));
      return;
    }
    const failure = await resendCode(webAuthApi, { email, captchaToken: captcha.token });
    if (failure) {
      setOtpError(t(failure));
      return;
    }
    setResendInfo(t("codeResent"));
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
  }

  async function handleBackToForm() {
    await clientState.vault.getState().discardLocalVault();
    setStep("form");
    setOtp("");
    setOtpError(null);
    setFinalizeError(false);
    setResendInfo(null);
    setResendCooldown(0);
  }

  if (mode === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("createAccountTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {t("loadingRegistration")}
          </p>
        </CardContent>
      </Card>
    );
  }

  // Email-OTP step: replaces the old "check your email" message with an in-page
  // code entry so we never leave the original tab.
  if (step === "awaitingOtp") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("enterCodeTitle")}</CardTitle>
          <CardDescription>
            {t("enterCodeDescription", { email })}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {finalizeError ? (
            <>
              {otpError && <p className="text-sm text-destructive">{otpError}</p>}
              <Button
                onClick={finalize}
                disabled={verifying}
                className="w-full"
              >
                {verifying ? tc("loading") : t("tryAgain")}
              </Button>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="otp-0" className="sr-only">
                  {t("codeLabel")}
                </Label>
                <PinInput
                  length={6}
                  value={otp}
                  onChange={setOtp}
                  onComplete={(v) => void handleVerify(v)}
                  error={!!otpError}
                  disabled={verifying}
                  autoFocus
                  ariaLabel={t("codeLabel")}
                />
              </div>
              {otpError && (
                <p className="text-center text-sm text-destructive">{otpError}</p>
              )}
              {resendInfo && (
                <p className="text-center text-sm text-success">{resendInfo}</p>
              )}
              <Captcha ref={captchaRef} action="sign-up" />
              <Button
                onClick={() => void handleVerify(otp)}
                disabled={verifying || otp.length < 6}
                className="w-full"
              >
                {verifying ? t("verifyingCode") : t("verifyButton")}
              </Button>
              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendCooldown > 0}
                  className="text-muted-foreground hover:underline disabled:opacity-50 disabled:hover:no-underline"
                >
                  {resendCooldown > 0
                    ? t("resendCodeIn", { seconds: resendCooldown })
                    : t("resendCode")}
                </button>
                <button
                  type="button"
                  onClick={handleBackToForm}
                  className="text-muted-foreground hover:underline"
                >
                  {t("backToDifferentEmail")}
                </button>
              </div>
            </>
          )}
        </CardContent>
        <CardFooter className="text-sm">
          <p className="text-muted-foreground">
            {t("alreadyHaveAccount")}{" "}
            <Link
              href="/login"
              className="font-medium text-primary hover:underline"
            >
              {tc("signIn")}
            </Link>
          </p>
        </CardFooter>
      </Card>
    );
  }

  if (mode === "closed") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("registrationClosedTitle")}</CardTitle>
          <CardDescription>{t("registrationClosed")}</CardDescription>
        </CardHeader>
        <CardFooter className="text-sm">
          <p className="text-muted-foreground">
            {t("alreadyHaveAccount")}{" "}
            <Link
              href="/login"
              className="font-medium text-primary hover:underline"
            >
              {tc("signIn")}
            </Link>
          </p>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("createAccountTitle")}</CardTitle>
        <CardDescription>{t("createAccountDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleRegister} className="flex flex-col gap-4">
          {mode === "invite" && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="invite-code">{t("inviteCode")}</Label>
              <Input
                id="invite-code"
                type="text"
                placeholder={t("inviteCodePlaceholder")}
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                required
              />
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">{t("email")}</Label>
            <Input
              id="email"
              type="email"
              placeholder={t("emailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">{t("password")}</Label>
            <Input
              id="password"
              type="password"
              placeholder={t("passwordPlaceholder")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm-password">{t("confirmPassword")}</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground hover:underline">
              {t("importNsecToggle")}
            </summary>
            <div className="mt-3 flex flex-col gap-2">
              <Label htmlFor="imported-nsec">{t("importNsecLabel")}</Label>
              <Input
                id="imported-nsec"
                value={importedNsec}
                onChange={(e) => setImportedNsec(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                placeholder={t("accountKeyPlaceholder")}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                {t("importNsecHint")}
              </p>
            </div>
          </details>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Captcha ref={captchaRef} action="sign-up" />
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? t("creatingAccount") : t("createAccount")}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="text-sm">
        <p className="text-muted-foreground">
          {t("alreadyHaveAccount")}{" "}
          <Link
            href="/login"
            className="font-medium text-primary hover:underline"
          >
            {tc("signIn")}
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}

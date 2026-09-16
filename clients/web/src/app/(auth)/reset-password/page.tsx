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
import { otpErrorMessage } from "@/components/auth/verify-code-form";
import { authClient } from "@/lib/auth/client";
import { captchaHeaders, isCaptchaError } from "@/lib/captcha/turnstile";

const RESEND_COOLDOWN_SECONDS = 60;

export default function ResetPasswordPage() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // In-page OTP step (mirrors registration): the email carries a sign-in code,
  // entered here; the code signs the user in in the same tab and we navigate to
  // /update-password to set the new password (+ re-wrap the vault).
  const [step, setStep] = useState<"form" | "awaitingOtp">("form");
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendInfo, setResendInfo] = useState<string | null>(null);
  // Turnstile widget of the current step: sending and resending the code each
  // need a fresh token.
  const captchaRef = useRef<CaptchaHandle>(null);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendCooldown]);

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const captcha = await requestCaptchaToken(captchaRef);
    if (!captcha.ok) {
      setError(t("captchaUnavailable"));
      setLoading(false);
      return;
    }

    // A sign-in code (not a password-reset one): entering it signs the user
    // in, and /update-password then sets the new password on that session.
    // The OTP step is the uniform response whether or not the email exists
    // (anti-enumeration), so a rejected send still advances. A captcha
    // rejection is the one exception: it says nothing about the email, and
    // advancing would park the parent on a code that was never sent.
    const { error: sendError } = await authClient.emailOtp.sendVerificationOtp(
      { email, type: "sign-in" },
      { headers: captchaHeaders(captcha.token) },
    );
    if (sendError && isCaptchaError(sendError.code)) {
      setError(t("captchaFailed"));
      setLoading(false);
      return;
    }

    setStep("awaitingOtp");
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    setLoading(false);
  }

  async function handleVerify(code: string) {
    if (code.length < 6 || verifying) return;
    setVerifying(true);
    setOtpError(null);

    const { error } = await authClient.signIn.emailOtp({ email, otp: code });
    if (error) {
      setOtpError(otpErrorMessage(error.code, t));
      setOtp("");
      setVerifying(false);
      return;
    }
    // Signed in (bearer stored) → set the new password + re-wrap the vault.
    router.push("/update-password");
    router.refresh();
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
    const { error } = await authClient.emailOtp.sendVerificationOtp(
      { email, type: "sign-in" },
      { headers: captchaHeaders(captcha.token) },
    );
    if (error) {
      setOtpError(
        isCaptchaError(error.code) ? t("captchaFailed") : t("resendFailed"),
      );
      return;
    }
    setResendInfo(t("codeResent"));
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
  }

  function handleBackToForm() {
    setStep("form");
    setOtp("");
    setOtpError(null);
    setResendInfo(null);
    setResendCooldown(0);
  }

  if (step === "awaitingOtp") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("enterCodeTitle")}</CardTitle>
          <CardDescription>
            {t("enterCodeResetDescription", { email })}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
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
          <Captcha ref={captchaRef} action="reset-password" />
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
        </CardContent>
        <CardFooter>
          <Link
            href="/login"
            className="text-sm text-muted-foreground hover:underline"
          >
            {t("backToSignIn")}
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("resetPasswordTitle")}</CardTitle>
        <CardDescription>{t("resetPasswordDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleReset} className="flex flex-col gap-4">
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
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Captcha ref={captchaRef} action="reset-password" />
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? t("sending") : t("sendResetCode")}
          </Button>
        </form>
      </CardContent>
      <CardFooter>
        <Link
          href="/login"
          className="text-sm text-muted-foreground hover:underline"
        >
          {t("backToSignIn")}
        </Link>
      </CardFooter>
    </Card>
  );
}

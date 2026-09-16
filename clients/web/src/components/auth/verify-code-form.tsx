"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PinInput } from "@/components/ui/pin-input";

const RESEND_COOLDOWN_SECONDS = 60;

/** Localized copy for a Better Auth email-OTP error code. */
export function otpErrorMessage(
  code: string | undefined,
  t: (key: "wrongCode" | "codeExpired" | "tooManyAttempts") => string,
): string {
  if (code === "OTP_EXPIRED") return t("codeExpired");
  if (code === "TOO_MANY_ATTEMPTS") return t("tooManyAttempts");
  return t("wrongCode");
}

interface VerifyCodeFormProps {
  /** Shown above the code entry (already localized, e.g. "We emailed a code to …"). */
  description: string;
  /** Verify the code. Resolve with an error message to show, or null on success. */
  onVerify: (code: string) => Promise<string | null>;
  /** Re-send the code. Resolve with an error message to show, or null on success. */
  onResend: () => Promise<string | null>;
  /** Leave the code step (e.g. back to the email + password form). */
  onBack: () => void;
  /**
   * Rendered between the messages and the Verify button: the caller's
   * `<Captcha>` widget, so a resend from this step can fetch a token.
   */
  children?: React.ReactNode;
}

/**
 * The 6-digit email-code entry used wherever a flow parks on "enter the code
 * we emailed you": owns the code value, the resend cooldown and the inline
 * error/info lines. On a successful verify the caller navigates away, so the
 * form stays in its busy state until it unmounts.
 */
export function VerifyCodeForm({
  description,
  onVerify,
  onResend,
  onBack,
  children,
}: VerifyCodeFormProps) {
  const t = useTranslations("auth");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendCooldown]);

  async function handleVerify(code: string) {
    if (code.length < 6 || verifying) return;
    setVerifying(true);
    setError(null);
    const message = await onVerify(code);
    if (message) {
      setError(message);
      setOtp("");
      setVerifying(false);
    }
  }

  async function handleResend() {
    if (resendCooldown > 0) return;
    setError(null);
    setInfo(null);
    const message = await onResend();
    if (message) {
      setError(message);
      return;
    }
    setInfo(t("codeResent"));
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{description}</p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="otp-0" className="sr-only">
          {t("codeLabel")}
        </Label>
        <PinInput
          length={6}
          value={otp}
          onChange={setOtp}
          onComplete={(v) => void handleVerify(v)}
          error={!!error}
          disabled={verifying}
          autoFocus
          ariaLabel={t("codeLabel")}
        />
      </div>
      {error && <p className="text-center text-sm text-destructive">{error}</p>}
      {info && <p className="text-center text-sm text-success">{info}</p>}
      {children}
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
          onClick={() => void handleResend()}
          disabled={resendCooldown > 0}
          className="text-muted-foreground hover:underline disabled:opacity-50 disabled:hover:no-underline"
        >
          {resendCooldown > 0
            ? t("resendCodeIn", { seconds: resendCooldown })
            : t("resendCode")}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="text-muted-foreground hover:underline"
        >
          {t("backToDifferentEmail")}
        </button>
      </div>
    </div>
  );
}

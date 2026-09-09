"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

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
import { isValidNsec } from "@dodi/crypto";
import { NpubConflictError } from "@dodi/protocol/client";
import { otpErrorMessage } from "@/components/auth/verify-code-form";
import { dodi } from "@/lib/api";
import { authClient } from "@/lib/auth/client";
import { useVaultStore } from "@/stores/vault-store";

type RegistrationMode = "open" | "invite" | "closed";

const RESEND_COOLDOWN_SECONDS = 60;

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await dodi.request("/api/auth/registration-status");
        const data = (await res.json()) as { mode?: RegistrationMode };
        if (!cancelled) setMode(data.mode ?? "open");
      } catch {
        // The platform's registration gate is the real gate, so failing open for
        // the UI is safe — a closed/invite server will still reject the signup.
        if (!cancelled) setMode("open");
      }
    })();
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

  // Map a /register rejection (registration closed, bad invite code) to
  // localized copy. Never echo raw auth errors — that could leak account
  // existence.
  function mapSignUpError(message: string): string {
    const m = message.toLowerCase();
    if (m.includes("invite")) return t("invalidInviteCode");
    if (m.includes("closed")) return t("registrationClosed");
    return t("genericSignupError");
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError(t("passwordsNoMatch"));
      return;
    }
    if (password.length < 8) {
      setError(t("passwordTooShort"));
      return;
    }
    if (mode === "invite" && !inviteCode.trim()) {
      setError(t("inviteRequired"));
      return;
    }
    if (importedNsec.trim() && !isValidNsec(importedNsec)) {
      setError(t("invalidAccountKey"));
      return;
    }

    setLoading(true);

    // The platform's /register front door (not Better Auth's own sign-up): it
    // applies the registration gate and validates the invite code, emails the
    // 6-digit confirmation code, and answers `{ ok: true }` for ANY well-formed
    // email — new or already registered — so nothing here leaks account
    // existence.
    let rejection: string | null = null;
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/auth/register`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email,
            password,
            inviteCode: mode === "invite" ? inviteCode.trim() : undefined,
          }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        rejection = body?.error ?? "";
      }
    } catch {
      rejection = "";
    }

    if (rejection !== null) {
      setError(mapSignUpError(rejection));
      setLoading(false);
      return;
    }

    // No session yet (the email must be confirmed first): build + seal the
    // vault while the password is in hand, then drop the password and move to
    // the in-page code step.
    try {
      await useVaultStore
        .getState()
        .createLocalVault(email, password, importedNsec.trim() || undefined);
    } catch (err) {
      console.error("[register] local vault creation failed", err);
      setError(t("vaultSetupFailed"));
      setLoading(false);
      return;
    }
    setPassword("");
    setConfirmPassword("");
    setStep("awaitingOtp");
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    setLoading(false);
  }

  async function finalize() {
    setVerifying(true);
    setOtpError(null);
    try {
      await useVaultStore.getState().finalizeVault();
      router.push("/vault-setup");
      router.refresh();
      // Navigation unmounts this page; leave `verifying` set.
    } catch (err) {
      if (err instanceof NpubConflictError) {
        // The imported Nostr key belongs to another account — retrying the
        // persist can never succeed, so skip the retry loop and leave "use a
        // different email" as the way out.
        await useVaultStore.getState().discardLocalVault();
        setOtpError(t("nsecTaken"));
        setVerifying(false);
        return;
      }
      setFinalizeError(true);
      setOtpError(t("vaultSetupFailed"));
      setVerifying(false);
    }
  }

  async function handleVerify(code: string) {
    if (code.length < 6 || verifying) return;
    setVerifying(true);
    setOtpError(null);

    const { error } = await authClient.emailOtp.verifyEmail({
      email,
      otp: code,
    });
    if (error) {
      setOtpError(otpErrorMessage(error.code, t));
      setOtp("");
      setVerifying(false);
      return;
    }
    // Verified ⇒ signed in (the bearer arrived with the response) → persist the
    // sealed vault + reveal phrase.
    await finalize();
  }

  async function handleResend() {
    if (resendCooldown > 0) return;
    setOtpError(null);
    setResendInfo(null);
    const { error } = await authClient.emailOtp.sendVerificationOtp({
      email,
      type: "email-verification",
    });
    if (error) {
      setOtpError(t("resendFailed"));
      return;
    }
    setResendInfo(t("codeResent"));
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
  }

  async function handleBackToForm() {
    await useVaultStore.getState().discardLocalVault();
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

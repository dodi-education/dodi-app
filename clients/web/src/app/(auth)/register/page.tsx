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
import { dodi } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Email-OTP sub-step: after signUp (confirmation on) we stay in-page and ask
  // for the emailed code, then finalize the vault. All client state — no
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
        // The before_user_created hook is the real gate, so failing open for the
        // UI is safe — a closed/invite server will still reject the signup.
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

  // Map a server/hook rejection (surfaced via signUp's error.message) to
  // localized copy. Never echo raw Supabase errors (e.g. "User already
  // registered") — that would leak account existence.
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

    setLoading(true);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // No emailRedirectTo → GoTrue's confirmation email carries the {{ .Token }}
        // code (entered in-page below), not a magic link.
        // Passed through to raw_user_meta_data; the before_user_created hook
        // validates it and handle_new_user() records the redemption.
        data:
          mode === "invite" ? { invite_code: inviteCode.trim() } : undefined,
      },
    });

    if (error) {
      setError(mapSignUpError(error.message));
      setLoading(false);
      return;
    }

    // Confirmation disabled → we have a session; bootstrap the E2EE vault now.
    if (data.session) {
      try {
        await useVaultStore.getState().bootstrap(password);
      } catch (err) {
        console.error("[register] vault bootstrap failed", err);
        setError(t("vaultSetupFailed"));
        setLoading(false);
        return;
      }
      router.push("/vault-setup");
      router.refresh();
      return;
    }

    // Confirmation on (no session): build + seal the vault while the password is
    // in hand, then drop the password and move to the in-page code step. This is
    // the uniform response for ANY email (new, unconfirmed, or already-registered)
    // — never branch on identities, which would leak account existence.
    try {
      await useVaultStore.getState().createLocalVault(password);
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
    } catch {
      setFinalizeError(true);
      setOtpError(t("vaultSetupFailed"));
      setVerifying(false);
    }
  }

  async function handleVerify(code: string) {
    if (code.length < 6 || verifying) return;
    setVerifying(true);
    setOtpError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: "signup",
    });
    if (error) {
      const errCode = (error as { code?: string }).code;
      setOtpError(errCode === "otp_expired" ? t("codeExpired") : t("wrongCode"));
      setOtp("");
      setVerifying(false);
      return;
    }
    // Session established in this tab → persist the sealed vault + reveal phrase.
    await finalize();
  }

  async function handleResend() {
    if (resendCooldown > 0) return;
    setOtpError(null);
    setResendInfo(null);
    const supabase = createClient();
    const { error } = await supabase.auth.resend({ type: "signup", email });
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

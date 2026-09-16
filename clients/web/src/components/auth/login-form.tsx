"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";

import {
  Captcha,
  type CaptchaHandle,
  requestCaptchaToken,
} from "@/components/auth/captcha";
import { VerifyCodeForm, otpErrorMessage } from "@/components/auth/verify-code-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { authClient } from "@/lib/auth/client";
import { captchaHeaders, isCaptchaError } from "@/lib/captcha/turnstile";
import { useAccountStore } from "@/stores/account-store";
import { useVaultStore } from "@/stores/vault-store";

/**
 * Adopt the account's stored UI language onto this device by seeding the
 * `NEXT_LOCALE` cookie from `accounts.language`. The cookie is only a
 * per-device cache; re-seeding it at login lets the parent's saved preference
 * follow them to new browsers/devices. Best-effort — on failure we keep
 * whatever cookie / Accept-Language was already resolving.
 */
async function seedLocaleFromAccount(): Promise<void> {
  try {
    // Force-load the shared account store: primes the cache for the parent
    // area (PIN gate, date prefs, plan badge ride the same fetch) and never
    // serves a previous user's account after a re-login.
    await useAccountStore.getState().load(true);
    const language = useAccountStore.getState().account?.language;
    if (language) {
      document.cookie = `NEXT_LOCALE=${language}; path=/; max-age=31536000`;
    }
  } catch {
    // best-effort; ignore
  }
}

/** Only same-app paths may be navigation targets (no `//host` or absolute URLs). */
function safeNextPath(next: string | null | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

interface LoginFormProps {
  /**
   * Same-app path to land on after a successful sign-in (deep link, e.g. the
   * public game page that opened the login dialog). Reached via a FULL
   * navigation so middleware primes the active-kid + locale cookies before the
   * server re-renders the signed-in experience.
   */
  next?: string | null;
}

/** The email + password sign-in form, shared by the login page and the login dialog. */
export function LoginForm({ next }: LoginFormProps) {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // An account that never confirmed its email gets a fresh code emailed on
  // sign-in; the code step here is the same one registration uses.
  const [step, setStep] = useState<"form" | "awaitingOtp">("form");
  // Turnstile widget of whichever step is showing (both mount one, since the
  // sign-in and the code resend each need a fresh token).
  const captchaRef = useRef<CaptchaHandle>(null);

  /** Signed in (bearer stored): unlock the vault, adopt the locale, navigate. */
  async function finishSignIn(): Promise<void> {
    // Unlock the E2EE vault with the same password. When the account has no
    // vault yet, this adopts the one registration sealed for this same email
    // (preserving an imported nsec) before falling back to a fresh vault; the
    // seal is consumed either way, so it never lingers as ciphertext.
    try {
      const unlockPromise = useVaultStore
        .getState()
        .unlockOrBootstrap(password, email);
      // Adopt the account's saved UI language onto this device before we render
      // the parent app (so a returning parent on a new device sees their
      // language). Needs only the auth session, so it loads concurrently with
      // the vault unlock instead of adding its round trip after it.
      const localePromise = seedLocaleFromAccount();
      const { created } = await unlockPromise;
      await localePromise;
      const target = safeNextPath(next);
      if (created) {
        router.push("/vault-setup");
        router.refresh();
      } else if (target) {
        window.location.assign(target);
      } else {
        router.push("/parent/dashboard");
        router.refresh();
      }
    } catch {
      setError(t("unlockAfterLoginFailed"));
      setStep("form");
      setLoading(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const captcha = await requestCaptchaToken(captchaRef);
    if (!captcha.ok) {
      setError(t("captchaUnavailable"));
      setLoading(false);
      return;
    }

    const { error: signInError } = await authClient.signIn.email(
      { email, password },
      { headers: captchaHeaders(captcha.token) },
    );

    if (signInError) {
      if (signInError.code === "EMAIL_NOT_VERIFIED") {
        // The platform has already emailed a fresh code; keep the password in
        // state so the vault unlocks once the code checks out.
        setStep("awaitingOtp");
        setLoading(false);
        return;
      }
      setError(
        isCaptchaError(signInError.code)
          ? t("captchaFailed")
          : (signInError.message ?? signInError.statusText),
      );
      setLoading(false);
      return;
    }

    await finishSignIn();
  }

  async function handleVerify(code: string): Promise<string | null> {
    const { error: verifyError } = await authClient.emailOtp.verifyEmail({
      email,
      otp: code,
    });
    if (verifyError) return otpErrorMessage(verifyError.code, t);
    // Verified ⇒ signed in (the bearer arrived with the response).
    await finishSignIn();
    return null;
  }

  async function handleResend(): Promise<string | null> {
    const captcha = await requestCaptchaToken(captchaRef);
    if (!captcha.ok) return t("captchaUnavailable");
    const { error: resendError } = await authClient.emailOtp.sendVerificationOtp(
      { email, type: "email-verification" },
      { headers: captchaHeaders(captcha.token) },
    );
    if (!resendError) return null;
    return isCaptchaError(resendError.code)
      ? t("captchaFailed")
      : t("resendFailed");
  }

  if (step === "awaitingOtp") {
    return (
      <VerifyCodeForm
        description={t("enterCodeDescription", { email })}
        onVerify={handleVerify}
        onResend={handleResend}
        onBack={() => {
          setStep("form");
          setError(null);
        }}
      >
        <Captcha ref={captchaRef} action="sign-in" />
      </VerifyCodeForm>
    );
  }

  return (
    <form onSubmit={handleLogin} className="flex flex-col gap-4">
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
        <PasswordInput
          id="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          showPasswordLabel={t("showPassword")}
          hidePasswordLabel={t("hidePassword")}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Captcha ref={captchaRef} action="sign-in" />
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? t("signingIn") : tc("signIn")}
      </Button>
    </form>
  );
}

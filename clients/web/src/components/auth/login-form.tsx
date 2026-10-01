"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";

import {
  Captcha,
  type CaptchaHandle,
  requestCaptchaToken,
} from "@/components/auth/captcha";
import { VerifyCodeForm } from "@/components/auth/verify-code-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import {
  resendCode,
  signIn,
  type SignInOutcome,
  verifySignInCode,
} from "@dodi/client-state";
import { webAuthApi } from "@/lib/auth/auth-api";
import { clientState } from "@/lib/client-state";

/**
 * Adopt the account's stored UI language onto this device by seeding the
 * `NEXT_LOCALE` cookie from `accounts.language`. The cookie is only a
 * per-device cache; re-seeding it at login lets the parent's saved preference
 * follow them to new browsers/devices.
 */
function seedLocale(language: string | null): void {
  if (language) document.cookie = `NEXT_LOCALE=${language}; path=/; max-age=31536000`;
}

/** The shared sign-in flows over this browser's auth client and stores. */
const authDeps = {
  auth: webAuthApi,
  vault: clientState.vault,
  account: clientState.account,
};

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

  /**
   * Act on a sign-in outcome. Signed in means the shared flow already opened
   * (or adopted) the vault with the password and loaded the account.
   */
  function handleOutcome(outcome: SignInOutcome): string | null {
    if (outcome.kind === "needs_code") {
      // The platform has already emailed a fresh code; keep the password in
      // state so the vault unlocks once the code checks out.
      setStep("awaitingOtp");
      setLoading(false);
      return null;
    }
    if (outcome.kind === "error") {
      const message = outcome.key ? t(outcome.key) : (outcome.message ?? "");
      if (outcome.key === "unlockAfterLoginFailed") setStep("form");
      setLoading(false);
      return message;
    }
    seedLocale(outcome.language);
    const target = safeNextPath(next);
    if (outcome.isNewVault) {
      router.push("/vault-setup");
      router.refresh();
    } else if (target) {
      window.location.assign(target);
    } else {
      router.push("/parent/dashboard");
      router.refresh();
    }
    return null;
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

    const outcome = await signIn(authDeps, { email, password, captchaToken: captcha.token });
    const message = handleOutcome(outcome);
    if (message !== null) setError(message);
  }

  async function handleVerify(code: string): Promise<string | null> {
    const outcome = await verifySignInCode(authDeps, { email, password, code });
    // Wrong / expired codes stay on the code step; a vault failure goes back.
    if (outcome.kind === "error" && outcome.key !== "unlockAfterLoginFailed") {
      return outcome.key ? t(outcome.key) : (outcome.message ?? "");
    }
    const message = handleOutcome(outcome);
    if (message !== null) setError(message);
    return null;
  }

  async function handleResend(): Promise<string | null> {
    const captcha = await requestCaptchaToken(captchaRef);
    if (!captcha.ok) return t("captchaUnavailable");
    const key = await resendCode(webAuthApi, { email, captchaToken: captcha.token });
    return key ? t(key) : null;
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

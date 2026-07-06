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
import { dodi } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import { useVaultStore } from "@/stores/vault-store";

type RegistrationMode = "open" | "invite" | "closed";

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
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
    setInfo(null);

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
        // After the user confirms their email, land on the finish-setup step
        // (verify password → bootstrap the E2EE vault → reveal recovery phrase).
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/finish-setup`,
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

    // With email confirmation enabled, signUp returns NO session — and returns
    // the same generic result whether or not the email already exists. Show one
    // uniform "check your email" message (anti-enumeration) and defer vault
    // bootstrap to first sign-in.
    if (!data.session) {
      setInfo(t("checkEmailToConfirm"));
      setLoading(false);
      return;
    }

    // Confirmation disabled → we have a session; bootstrap the E2EE vault now.
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

  // Successful signup: replace the whole form with just the confirmation
  // message so nothing else competes for attention.
  if (info) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("createAccountTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-success">{info}</p>
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

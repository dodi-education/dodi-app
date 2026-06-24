"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
import { createClient } from "@/lib/supabase/client";
import { useVaultStore } from "@/stores/vault-store";

export default function RegisterPage() {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

    setLoading(true);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // If the project requires email confirmation, signUp returns NO session, so
    // we can't set up the encrypted vault yet (it needs an authenticated
    // request). Tell the user to confirm + sign in; the vault is then
    // bootstrapped on first authenticated entry (login / the gate's setup step).
    if (!data.session) {
      setInfo(
        "Account created. Check your email to confirm your address, then sign in — you'll get your recovery phrase right after.",
      );
      setLoading(false);
      return;
    }

    // We have a session — bootstrap the E2EE vault (generates the recovery
    // phrase) before entering.
    try {
      await useVaultStore.getState().bootstrap(password);
    } catch (err) {
      console.error("[register] vault bootstrap failed", err);
      setError(
        "Account created, but we couldn't set up your secure vault. Please sign in to finish setup.",
      );
      setLoading(false);
      return;
    }

    router.push("/vault-setup");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("createAccountTitle")}</CardTitle>
        <CardDescription>
          {t("createAccountDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleRegister} className="flex flex-col gap-4">
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
          {info && <p className="text-sm text-success">{info}</p>}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? t("creatingAccount") : t("createAccount")}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="text-sm">
        <p className="text-muted-foreground">
          {t("alreadyHaveAccount")}{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            {tc("signIn")}
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}

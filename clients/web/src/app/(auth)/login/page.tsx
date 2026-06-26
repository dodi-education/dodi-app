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
import { dodi } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
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
    const res = await dodi.request("/api/account");
    if (!res.ok) return;
    const { account } = (await res.json()) as {
      account: { language?: string } | null;
    };
    if (account?.language) {
      document.cookie = `NEXT_LOCALE=${account.language}; path=/; max-age=31536000`;
    }
  } catch {
    // best-effort; ignore
  }
}

export default function LoginPage() {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Unlock the E2EE vault with the same password (bootstraps one if this
    // account predates the vault).
    try {
      const { created } = await useVaultStore.getState().unlockOrBootstrap(password);
      // Adopt the account's saved UI language onto this device before we render
      // the parent app (so a returning parent on a new device sees their language).
      await seedLocaleFromAccount();
      router.push(created ? "/vault-setup" : "/parent/dashboard");
      router.refresh();
    } catch {
      setError(
        "Signed in, but we couldn't unlock your encrypted data. If you recently changed your password, you'll need your recovery phrase.",
      );
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("welcomeBack")}</CardTitle>
        <CardDescription>{t("signInDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
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
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? t("signingIn") : tc("signIn")}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="flex flex-col gap-2 text-sm">
        <Link
          href="/reset-password"
          className="text-muted-foreground hover:underline"
        >
          {t("forgotPassword")}
        </Link>
        <p className="text-muted-foreground">
          {t("noAccount")}{" "}
          <Link href="/register" className="font-medium text-primary hover:underline">
            {tc("signUp")}
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}

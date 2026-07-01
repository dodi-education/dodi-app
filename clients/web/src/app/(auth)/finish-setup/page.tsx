"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { useVaultStore } from "@/stores/vault-store";

/**
 * Post-email-confirmation step (the register flow lands here via
 * /auth/callback?next=/finish-setup). The user is authenticated from the
 * confirm link but has no E2EE vault yet — it can only be bootstrapped now,
 * because it derives from the password, which never left their original browser
 * (the confirm link may even be opened on another device). We re-verify the
 * password against the account so the vault password stays in sync with auth,
 * bootstrap the vault, then send them to reveal their recovery phrase.
 */
export default function FinishSetupPage() {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace("/login");
        return;
      }
      setEmail(data.user.email ?? null);
      setChecking(false);
    });
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setError(null);
    if (password.length < 8) {
      setError(t("passwordTooShort"));
      return;
    }
    setLoading(true);

    const supabase = createClient();
    // Verify the password matches the account before deriving the vault from it,
    // so a later login (which unlocks with the account password) will work.
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) {
      setError(t("finishSetupWrongPassword"));
      setLoading(false);
      return;
    }

    try {
      const { created } = await useVaultStore
        .getState()
        .unlockOrBootstrap(password);
      // created === true → vault was just bootstrapped; go reveal the phrase.
      router.push(created ? "/vault-setup" : "/parent/dashboard");
      router.refresh();
    } catch {
      setError(t("vaultSetupFailed"));
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("finishSetupTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{tc("loading")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("finishSetupTitle")}</CardTitle>
        <CardDescription>{t("finishSetupDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">{t("password")}</Label>
            <Input
              id="password"
              type="password"
              placeholder={t("passwordPlaceholder")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? tc("loading") : t("finishSetupSubmit")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

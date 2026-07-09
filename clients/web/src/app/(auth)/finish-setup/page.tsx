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

type SetupResult =
  | { status: "ok"; created: boolean }
  | { status: "wrong-password" }
  | { status: "vault-failed" };

/**
 * Verify the password against the account (so the vault password stays in sync
 * with auth), then bootstrap-or-unlock the E2EE vault.
 */
async function runSetup(email: string, password: string): Promise<SetupResult> {
  const supabase = createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) return { status: "wrong-password" };
  try {
    const { created } = await useVaultStore
      .getState()
      .unlockOrBootstrap(password);
    return { status: "ok", created };
  } catch {
    return { status: "vault-failed" };
  }
}

/**
 * Safety net for the "authenticated but no vault" (needs-setup) state — reached
 * via VaultGate / the kid layout when `fetchVaultKeys()` is null: a registration
 * whose vault persist failed, a post-reset account that predates the vault, etc.
 * Registration itself no longer lands here — the email-OTP flow bootstraps the
 * vault in-page. We re-verify the password against the account before deriving
 * the vault from it, so the vault password stays in sync with auth.
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

    const res = await runSetup(email, password);
    if (res.status === "wrong-password") {
      setError(t("finishSetupWrongPassword"));
      setLoading(false);
      return;
    }
    if (res.status === "vault-failed") {
      setError(t("vaultSetupFailed"));
      setLoading(false);
      return;
    }
    router.push(res.created ? "/vault-setup" : "/parent/dashboard");
    router.refresh();
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

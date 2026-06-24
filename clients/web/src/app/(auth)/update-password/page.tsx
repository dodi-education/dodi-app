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
import { isValidBackupPhrase } from "@dodi/crypto";
import { createClient } from "@/lib/supabase/client";
import { fetchVaultKeys } from "@/lib/vault-client";
import { useVaultStore } from "@/stores/vault-store";

/**
 * Landing page for the password-reset email link (see reset-password →
 * /auth/callback?next=/update-password). The recovery link has already
 * established a Supabase session, so the user can set a new auth password here.
 *
 * Because data is end-to-end encrypted and the old password is unknown, the
 * vault must be re-encrypted under the new password using the 12-word recovery
 * phrase. This page keeps the Supabase auth password and the vault wrap in sync;
 * the phrase is verified before either is changed.
 */
export default function UpdatePasswordPage() {
  const t = useTranslations("auth");
  const router = useRouter();

  // null = still checking whether this account has an encrypted vault.
  const [hasVault, setHasVault] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phrase, setPhrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchVaultKeys()
      .then((keys) => setHasVault(keys !== null))
      .catch(() => setHasVault(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
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
    if (hasVault && !isValidBackupPhrase(phrase)) {
      setError(t("invalidPhrase"));
      return;
    }

    setLoading(true);
    const supabase = createClient();

    try {
      const updateAuthPassword = async () => {
        const { error: authError } = await supabase.auth.updateUser({ password });
        if (authError) throw new Error(authError.message);
      };

      if (hasVault) {
        // Verifies the phrase, updates the auth password, then re-wraps the
        // vault — all-or-nothing on the phrase check.
        await useVaultStore
          .getState()
          .resetPasswordWithPhrase(phrase, password, updateAuthPassword);
      } else {
        await updateAuthPassword();
      }

      router.push("/parent/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("updatePasswordFailed"));
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("updatePasswordTitle")}</CardTitle>
        <CardDescription>
          {hasVault === false
            ? t("updatePasswordDescription")
            : t("updatePasswordWithPhraseHint")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">{t("newPassword")}</Label>
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
          {hasVault && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="phrase">{t("recoveryPhrase")}</Label>
              <textarea
                id="phrase"
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                required
                rows={3}
                placeholder={t("recoveryPhrasePlaceholder")}
                className="min-h-[80px] w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary-soft-2"
              />
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            type="submit"
            disabled={loading || hasVault === null}
            className="w-full"
          >
            {loading ? t("updatingPassword") : t("updatePassword")}
          </Button>
        </form>
      </CardContent>
      <CardFooter>
        <Link
          href="/login"
          className="text-sm text-muted-foreground hover:underline"
        >
          {t("backToSignIn")}
        </Link>
      </CardFooter>
    </Card>
  );
}

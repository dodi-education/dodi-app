"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Section } from "@/components/parent/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { useVaultStore } from "@/stores/vault-store";

/**
 * Change-password form for a signed-in parent whose vault is already unlocked
 * (the parent layout's VaultGate guarantees this). It updates the Supabase auth
 * password and re-wraps the vault under it in one step — no old password or
 * recovery phrase needed, since the in-memory VMK proves vault access.
 */
export function ChangePassword() {
  const t = useTranslations("settings");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);

    if (password !== confirm) {
      setError(t("passwordsNoMatch"));
      return;
    }
    if (password.length < 8) {
      setError(t("passwordTooShort"));
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      // Auth first (validates length/session); only then re-wrap the vault, so a
      // rejected auth update leaves the vault untouched.
      const { error: authError } = await supabase.auth.updateUser({ password });
      if (authError) throw new Error(authError.message);
      await useVaultStore.getState().changePassword(password);
      setDone(true);
      setPassword("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("changePasswordFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title={t("changePasswordTitle")} desc={t("changePasswordDescription")}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 py-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="new-password">{t("newPassword")}</Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => {
              setError(null);
              setDone(false);
              setPassword(e.target.value);
            }}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="confirm-new-password">{t("confirmNewPassword")}</Label>
          <Input
            id="confirm-new-password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => {
              setError(null);
              setDone(false);
              setConfirm(e.target.value);
            }}
            required
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {done && <p className="text-sm text-success">{t("passwordChanged")}</p>}
        <div>
          <Button type="submit" disabled={busy}>
            {busy ? t("updatingPassword") : t("updatePassword")}
          </Button>
        </div>
      </form>
    </Section>
  );
}

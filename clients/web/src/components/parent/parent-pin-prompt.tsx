"use client";

import Image from "next/image";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PinInput } from "@/components/ui/pin-input";
import { markParentUnlocked } from "@/lib/parent-lock";
import { createClient } from "@/lib/supabase/client";
import { useAccountStore } from "@/stores/account-store";
import { useVaultStore } from "@/stores/vault-store";

/**
 * Shown by `ParentPinGate` when a parent PIN is set and the device session is
 * locked. Verifies the 4-digit PIN by decrypting the stored ciphertext with the
 * (already-unlocked) VaultSession — server is never involved. A "forgot PIN"
 * escape re-verifies the account password via Supabase auth, which (unlike the
 * vault store's unlock) never mutates vault status, so this prompt stays mounted.
 */
export function ParentPinPrompt() {
  const t = useTranslations("parentPin");
  const pinEnc = useAccountStore((s) => s.account?.parent_pin_enc ?? null);

  const [value, setValue] = useState("");
  const [error, setError] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  function verify(entered: string) {
    const session = useVaultStore.getState().session;
    if (session && pinEnc && session.decryptField(pinEnc) === entered) {
      markParentUnlocked();
      return;
    }
    setError(true);
    setValue("");
  }

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError(null);
    setPwBusy(true);
    try {
      const supabase = createClient();
      // Email from the local session (no network) — signInWithPassword is the
      // actual server-side verification.
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession();
      const email = authSession?.user.email;
      if (!email) throw new Error("no-email");
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setPwError(t("passwordWrong"));
        return;
      }
      markParentUnlocked();
    } catch {
      setPwError(t("passwordWrong"));
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="w-full max-w-xs text-center">
        <Image
          src="/images/dodi-head-active.png"
          alt=""
          width={48}
          height={48}
          className="mx-auto"
        />
        <h1 className="mt-4 text-xl font-bold tracking-tight">
          {t("promptTitle")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("promptSubtitle")}
        </p>

        <div className="mt-6">
          <PinInput
            value={value}
            onChange={(v) => {
              setError(false);
              setValue(v);
            }}
            onComplete={verify}
            error={error}
            autoFocus
            ariaLabel={t("promptTitle")}
          />
          {error && (
            <p className="mt-3 text-sm text-destructive">{t("wrong")}</p>
          )}
        </div>

        {showPassword ? (
          <form
            onSubmit={handlePassword}
            className="mt-6 flex flex-col gap-3 text-left"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="pin-password">{t("passwordLabel")}</Label>
              <Input
                id="pin-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPwError(null);
                  setPassword(e.target.value);
                }}
                required
              />
            </div>
            {pwError && <p className="text-sm text-destructive">{pwError}</p>}
            <Button type="submit" disabled={pwBusy || !password}>
              {pwBusy ? t("checking") : t("unlock")}
            </Button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setShowPassword(true)}
            className="mt-6 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-primary"
          >
            {t("forgot")}
          </button>
        )}
      </div>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { clearSealedSecret } from "@/lib/sealed-secret";
import { createClient } from "@/lib/supabase/client";
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

    // Signing in directly (not via the OTP step) makes any vault sealed at
    // registration moot — drop it so it never lingers as ciphertext.
    void clearSealedSecret();

    // Unlock the E2EE vault with the same password (bootstraps one if this
    // account predates the vault).
    try {
      const unlockPromise = useVaultStore.getState().unlockOrBootstrap(password);
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
      setLoading(false);
    }
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
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? t("signingIn") : tc("signIn")}
      </Button>
    </form>
  );
}

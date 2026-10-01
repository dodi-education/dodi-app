"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import {
  Captcha,
  type CaptchaHandle,
  requestCaptchaToken,
} from "@/components/auth/captcha";
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
import { webAuthApi } from "@/lib/auth/auth-api";
import { getSessionUser } from "@/lib/auth/client";
import { clientState } from "@/lib/client-state";
import {
  finishSetup,
  validateFinishSetup,
} from "@dodi/client-state/finish-setup";

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
  const captchaRef = useRef<CaptchaHandle>(null);

  useEffect(() => {
    void getSessionUser().then((user) => {
      if (!user) {
        router.replace("/login");
        return;
      }
      setEmail(user.email || null);
      setChecking(false);
    });
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setError(null);
    const invalid = validateFinishSetup(password);
    if (invalid) {
      setError(t(invalid));
      return;
    }
    setLoading(true);

    const captcha = await requestCaptchaToken(captchaRef);
    if (!captcha.ok) {
      setError(t("captchaUnavailable"));
      setLoading(false);
      return;
    }

    // Verify the password against the account (a captcha'd sign-in), then
    // bootstrap-or-unlock the vault with it.
    const res = await finishSetup(
      { auth: webAuthApi, vault: clientState.vault },
      { email, password, captchaToken: captcha.token },
    );
    if (res.kind === "error") {
      setError(t(res.key));
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
          <Captcha ref={captchaRef} action="sign-in" />
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? tc("loading") : t("finishSetupSubmit")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

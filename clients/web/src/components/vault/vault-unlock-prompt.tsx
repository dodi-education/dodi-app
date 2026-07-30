"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
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
import { useVaultStore } from "@/stores/vault-store";

/**
 * Shown by the VaultGate when silent device-unlock fails: a new device that
 * needs the password (or the nsec account key), or an account with no vault yet.
 */
export function VaultUnlockPrompt() {
  const t = useTranslations("vault");
  const router = useRouter();
  const status = useVaultStore((s) => s.status);
  const needsSetup = status === "needs-setup";

  const [mode, setMode] = useState<"password" | "nsec">("password");
  const [password, setPassword] = useState("");
  const [nsec, setNsec] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (needsSetup) {
        await useVaultStore.getState().bootstrap(password);
        router.push("/vault-setup");
        return;
      }
      if (mode === "password") {
        await useVaultStore.getState().unlockWithPassword(password);
      } else {
        await useVaultStore.getState().unlockWithNsec(nsec);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("unlockFailed"));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center p-4">
      <Card>
        <CardHeader>
          <CardTitle>
            {needsSetup ? t("setupTitle") : t("unlockTitle")}
          </CardTitle>
          <CardDescription>
            {needsSetup
              ? t("setupDescription")
              : mode === "password"
                ? t("unlockPasswordDescription")
                : t("unlockNsecDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {needsSetup || mode === "password" ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="vault-password">{t("passwordLabel")}</Label>
                <Input
                  id="vault-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoFocus
                />
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Label htmlFor="vault-nsec">{t("nsecLabel")}</Label>
                <Input
                  id="vault-nsec"
                  value={nsec}
                  onChange={(e) => setNsec(e.target.value)}
                  required
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={t("nsecPlaceholder")}
                  className="font-mono"
                />
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={busy} className="w-full">
              {busy
                ? t("unlocking")
                : needsSetup
                  ? t("createVault")
                  : t("unlock")}
            </Button>
          </form>
          {!needsSetup && (
            <button
              type="button"
              onClick={() => {
                setMode(mode === "password" ? "nsec" : "password");
                setError(null);
              }}
              className="mt-3 w-full text-center text-sm text-muted-foreground hover:underline"
            >
              {mode === "password"
                ? t("forgotPasswordUseKey")
                : t("usePasswordInstead")}
            </button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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
 * needs the password (or recovery phrase), or an account with no vault yet.
 */
export function VaultUnlockPrompt() {
  const router = useRouter();
  const status = useVaultStore((s) => s.status);
  const needsSetup = status === "needs-setup";

  const [mode, setMode] = useState<"password" | "phrase">("password");
  const [password, setPassword] = useState("");
  const [phrase, setPhrase] = useState("");
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
        await useVaultStore.getState().unlockWithPhrase(phrase);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't unlock the vault");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center p-4">
      <Card>
        <CardHeader>
          <CardTitle>
            {needsSetup ? "Set up your secure vault" : "Unlock your data"}
          </CardTitle>
          <CardDescription>
            {needsSetup
              ? "Choose a password to encrypt your family's data on this device."
              : mode === "password"
                ? "Enter your password to decrypt your data on this device."
                : "Enter your 12-word recovery phrase to restore access."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {needsSetup || mode === "password" ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="vault-password">Password</Label>
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
                <Label htmlFor="vault-phrase">Recovery phrase</Label>
                <textarea
                  id="vault-phrase"
                  value={phrase}
                  onChange={(e) => setPhrase(e.target.value)}
                  required
                  rows={3}
                  placeholder="twelve words separated by spaces"
                  className="min-h-[80px] w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary-soft-2"
                />
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Unlocking…" : needsSetup ? "Create vault" : "Unlock"}
            </Button>
          </form>
          {!needsSetup && (
            <button
              type="button"
              onClick={() => {
                setMode(mode === "password" ? "phrase" : "password");
                setError(null);
              }}
              className="mt-3 w-full text-center text-sm text-muted-foreground hover:underline"
            >
              {mode === "password"
                ? "Forgot password? Use recovery phrase"
                : "Use password instead"}
            </button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

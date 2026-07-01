"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useVaultStore } from "@/stores/vault-store";

import { VaultUnlockPrompt } from "./vault-unlock-prompt";

/**
 * Gates the authenticated app on an unlocked vault. On load it silently
 * unlocks via this device's key; if that fails, it either prompts to unlock an
 * existing vault (locked) or, when there's no vault yet (needs-setup, e.g. right
 * after email confirmation), routes to /finish-setup — which verifies the
 * account password before bootstrapping, so the vault password stays in sync
 * with auth. Children only render once the VaultSession is available.
 */
export function VaultGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const status = useVaultStore((s) => s.status);

  useEffect(() => {
    if (status === "idle") {
      void useVaultStore.getState().unlockSilently();
    }
  }, [status]);

  useEffect(() => {
    if (status === "needs-setup") {
      router.replace("/finish-setup");
    }
  }, [status, router]);

  if (status === "unlocked") {
    return <>{children}</>;
  }

  if (status === "locked") {
    return <VaultUnlockPrompt />;
  }

  // idle | working | needs-setup (redirecting) — nothing to interact with yet
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <p className="text-sm text-muted-foreground">
        Unlocking your secure vault…
      </p>
    </div>
  );
}

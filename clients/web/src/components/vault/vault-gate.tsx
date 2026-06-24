"use client";

import { useEffect } from "react";

import { useVaultStore } from "@/stores/vault-store";

import { VaultUnlockPrompt } from "./vault-unlock-prompt";

/**
 * Gates the authenticated app on an unlocked vault. On load it silently
 * unlocks via this device's key; if that fails (new device / no vault), it
 * shows the unlock-or-setup prompt. Children only render once the VaultSession
 * is available, so the data layer can always decrypt.
 */
export function VaultGate({ children }: { children: React.ReactNode }) {
  const status = useVaultStore((s) => s.status);

  useEffect(() => {
    if (status === "idle") {
      void useVaultStore.getState().unlockSilently();
    }
  }, [status]);

  if (status === "unlocked") {
    return <>{children}</>;
  }

  if (status === "locked" || status === "needs-setup") {
    return <VaultUnlockPrompt />;
  }

  // idle | working — silent unlock in progress
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <p className="text-sm text-muted-foreground">
        Unlocking your secure vault…
      </p>
    </div>
  );
}

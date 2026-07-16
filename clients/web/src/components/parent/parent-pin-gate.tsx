"use client";

import { useEffect, useSyncExternalStore } from "react";

import { isParentUnlocked, subscribeParentLock } from "@/lib/parent-lock";
import { useAccountStore } from "@/stores/account-store";
import { useVaultStore } from "@/stores/vault-store";

import { ParentPinPrompt } from "./parent-pin-prompt";

/**
 * Gates /parent/* behind the optional parent PIN. Composed INSIDE VaultGate, so
 * the VaultSession is always available to decrypt the stored PIN. The per-device
 * unlock flag lives in sessionStorage (see lib/parent-lock); we read it via
 * useSyncExternalStore so the gate re-renders the instant the prompt unlocks.
 *
 * Fails OPEN if the account can't be loaded (offline/flaky), so a network blip
 * never bricks the entire parent area — including the page that removes the PIN.
 *
 * NOTE: this gate covers every /parent/* route only because it lives in the
 * shared `app/parent/layout.tsx`. A future parent route with its own layout that
 * bypasses this would be ungated.
 */
export function ParentPinGate({ children }: { children: React.ReactNode }) {
  const unlocked = useSyncExternalStore(
    subscribeParentLock,
    isParentUnlocked,
    () => false,
  );
  const session = useVaultStore((s) => s.session);
  const pinEnc = useAccountStore((s) => s.account?.parent_pin_enc ?? null);
  const loaded = useAccountStore((s) => s.loaded);
  const loadFailed = useAccountStore((s) => s.loadFailed);
  const load = useAccountStore((s) => s.load);

  useEffect(() => {
    void load();
  }, [load]);

  // Unlocked for this device session → straight through.
  if (unlocked) return <>{children}</>;

  // Still resolving whether a PIN exists — never flash protected content.
  if (!loaded) {
    return <div className="min-h-[60vh]" aria-busy />;
  }

  // Fail open: couldn't load the account, or no PIN set, or (defensively) no
  // session to verify with.
  if (loadFailed || pinEnc === null || !session) return <>{children}</>;

  return <ParentPinPrompt />;
}

import { type ReactNode, useEffect, useSyncExternalStore } from "react";
import { View } from "react-native";

import { getIsParentUnlocked, subscribeParentLock } from "@/adapters/platform";
import { useAccountStore, useVaultStore } from "@/lib/client-state";

import { ParentPinPrompt } from "./parent-pin-prompt";

/**
 * Gates the parent area behind the optional parent PIN (inside VaultGate, so
 * the session can decrypt the stored PIN). Unlocking lasts for the app
 * process. Fails OPEN when the account can't load, so a network blip never
 * locks the parent out of the page that removes the PIN.
 */
export function ParentPinGate({ children }: { children: ReactNode }) {
  const isUnlocked = useSyncExternalStore(subscribeParentLock, getIsParentUnlocked);
  const session = useVaultStore((s) => s.session);
  const pinEnc = useAccountStore((s) => s.account?.parent_pin_enc ?? null);
  const isLoaded = useAccountStore((s) => s.loaded);
  const hasLoadFailed = useAccountStore((s) => s.loadFailed);
  const load = useAccountStore((s) => s.load);

  useEffect(() => {
    void load();
  }, [load]);

  if (isUnlocked) return <>{children}</>;
  // Still resolving whether a PIN exists: never flash protected content.
  if (!isLoaded) return <View className="flex-1 bg-background" accessibilityState={{ busy: true }} />;
  if (hasLoadFailed || pinEnc === null || !session) return <>{children}</>;
  return <ParentPinPrompt />;
}

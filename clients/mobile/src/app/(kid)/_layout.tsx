import { Redirect, Slot } from "expo-router";

import { KidChrome } from "@/components/kid/kid-chrome";
import { KidLocaleProvider } from "@/components/kid/kid-locale-provider";
import { VaultGate } from "@/components/vault/vault-gate";
import { useSession } from "@/lib/session";

/**
 * The kid view (web: app/(kid)/layout + components/kid/kid-chrome): signed in,
 * vault open (silently, with the device key), the active kid's language, then
 * the kid chrome (header, PIN gate, bottom nav) around the kid screens
 * (home, games, snapshots, friends). No tab bar, no native headers.
 */
export default function KidLayout() {
  const isSignedIn = useSession((s) => s.isSignedIn);
  if (!isSignedIn) return <Redirect href="/login" />;

  return (
    <VaultGate>
      <KidLocaleProvider>
        <KidChrome>
          <Slot />
        </KidChrome>
      </KidLocaleProvider>
    </VaultGate>
  );
}

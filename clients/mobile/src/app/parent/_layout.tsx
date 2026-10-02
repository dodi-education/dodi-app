import { Redirect, Slot } from "expo-router";

import { ParentPinGate } from "@/components/parent/parent-pin-gate";
import { ParentShell } from "@/components/shared/parent-shell";
import { VaultGate } from "@/components/vault/vault-gate";
import { useSession } from "@/lib/session";

/**
 * The parent area (web: app/parent/layout): signed in, vault open, parent PIN
 * (if set) solved, then the web's phone shell (top bar + drawer). No tab bar,
 * no native headers.
 */
export default function ParentLayout() {
  const isSignedIn = useSession((s) => s.isSignedIn);
  if (!isSignedIn) return <Redirect href="/login" />;

  return (
    <VaultGate>
      <ParentPinGate>
        <ParentShell>
          <Slot />
        </ParentShell>
      </ParentPinGate>
    </VaultGate>
  );
}

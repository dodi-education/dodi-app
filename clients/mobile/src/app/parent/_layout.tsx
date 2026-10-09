import { Redirect, Slot, useGlobalSearchParams, usePathname } from "expo-router";

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
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  if (!isSignedIn) {
    // Carry the deep link (with its query, e.g. ?code=) through sign-in, as the web does.
    const query = new URLSearchParams(
      Object.entries(params).flatMap(([key, value]) => (typeof value === "string" ? [[key, value]] : [])),
    ).toString();
    const next = `${pathname}${query ? `?${query}` : ""}`;
    return <Redirect href={{ pathname: "/login", params: { next } }} />;
  }

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

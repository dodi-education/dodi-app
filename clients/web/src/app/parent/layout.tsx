import { BuildActivityHost } from "@/components/parent/games/build-activity-host";
import { ParentAccessGuard } from "@/components/parent/parent-access-guard";
import { ParentPinGate } from "@/components/parent/parent-pin-gate";
import { ParentShell } from "@/components/shared/parent-shell";
import { VaultGate } from "@/components/vault/vault-gate";

// Auth gating is handled by middleware (unauth -> /login); data is fetched
// client-side, so this layout is a pure shell. ParentPinGate sits inside
// VaultGate so the vault session is available to verify the optional parent PIN;
// ParentAccessGuard keeps scoped family members on the pages they were granted.
export default function ParentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ParentShell>
      <VaultGate>
        <ParentPinGate>
          <ParentAccessGuard>{children}</ParentAccessGuard>
        </ParentPinGate>
        <BuildActivityHost />
      </VaultGate>
    </ParentShell>
  );
}

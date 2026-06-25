import { ParentShell } from "@/components/shared/parent-shell";
import { VaultGate } from "@/components/vault/vault-gate";

// Auth gating is handled by middleware (unauth -> /login); data is fetched
// client-side, so this layout is a pure shell.
export default function ParentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ParentShell>
      <VaultGate>{children}</VaultGate>
    </ParentShell>
  );
}

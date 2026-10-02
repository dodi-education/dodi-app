import { Redirect } from "expo-router";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { useTranslations } from "use-intl";

import { CenteredPage } from "@/components/auth/centered-page";
import { Text } from "@/components/ui";
import { useVaultStore } from "@/lib/client-state";

import { VaultUnlockPrompt } from "./vault-unlock-prompt";

/**
 * Gates the signed-in app on an unlocked vault (web: components/vault/vault-gate):
 * the device key unlocks it silently; otherwise the parent unlocks with the
 * password (or the account key). An account with no vault yet goes to
 * finish-setup, which verifies the account password first so vault and
 * sign-in passwords stay in sync.
 */
export function VaultGate({ children }: { children: ReactNode }) {
  const t = useTranslations("vault");
  const status = useVaultStore((s) => s.status);

  useEffect(() => {
    if (status === "idle") void useVaultStore.getState().unlockSilently();
  }, [status]);

  if (status === "unlocked") return <>{children}</>;
  if (status === "locked") return <VaultUnlockPrompt />;
  if (status === "needs-setup") return <Redirect href="/finish-setup" />;
  // idle | working: nothing to interact with yet.
  return (
    <CenteredPage>
      <Text className="text-center text-sm text-muted-foreground" accessibilityLiveRegion="polite">
        {t("unlockingVault")}
      </Text>
    </CenteredPage>
  );
}

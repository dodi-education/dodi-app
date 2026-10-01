import * as Clipboard from "expo-clipboard";
import { Redirect, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";

import { Button, Card, Screen, SwitchRow, Text } from "@/components/ui";
import { useVaultStore } from "@/lib/client-state";

/**
 * Shown once after the vault is created: the nsec account key, the only way
 * back in after a forgotten password on a lost device (web: vault-setup).
 */
export default function VaultSetupScreen() {
  const t = useTranslations("vault");
  const router = useRouter();
  const nsec = useVaultStore((s) => s.pendingNsec);
  const acknowledge = useVaultStore((s) => s.acknowledgeNsec);
  const [isCopied, setIsCopied] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const hasContinued = useRef(false);

  // Landed here with nothing to show (e.g. a relaunch after setup): leave.
  if (!nsec) return hasContinued.current ? null : <Redirect href="/parent/dashboard" />;

  async function copyKey(): Promise<void> {
    if (!nsec) return;
    await Clipboard.setStringAsync(nsec);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  }

  function finish(): void {
    hasContinued.current = true;
    acknowledge();
    // Onboarding continues with the account preferences step.
    router.replace("/onboarding");
  }

  return (
    <Screen isCentered>
      <Card title={t("saveKeyTitle")} description={t("saveKeyDescription")}>
        <View className="rounded-xl border border-border bg-muted px-3 py-3">
          <Text selectable className="text-center font-mono text-sm" accessibilityLabel={t("saveKeyTitle")}>
            {nsec}
          </Text>
        </View>
        <Button variant="secondary" label={isCopied ? t("keyCopied") : t("copyKey")} onPress={() => void copyKey()} />
        <SwitchRow label={t("savedItConfirm")} value={isSaved} onValueChange={setIsSaved} />
        <Button label={t("continue")} disabled={!isSaved} onPress={finish} />
      </Card>
    </Screen>
  );
}

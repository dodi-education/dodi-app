/**
 * Dashboard nudge (web: parent/ai-setup-card): until the family has an AI
 * provider, an own key in the vault or a category on dodi AI, nothing that
 * needs a model works. Invisible while either source loads, and once either
 * is in place.
 */
import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";
import { loadModelConfig, needsAiSetup } from "@dodi/client-state/dashboard";
import type { AccountModelConfig } from "@dodi/types/ai";

import { api } from "@/adapters/platform";
import { Button, Card, Text } from "@/components/ui";
import { IconAi } from "@/components/ui/icons";
import { useProvidersStore, useVaultStore } from "@/lib/client-state";

export function AiSetupCard() {
  const t = useTranslations("dashboard");
  const session = useVaultStore((s) => s.session);
  const providers = useProvidersStore((s) => s.providers);
  const loadProviders = useProvidersStore((s) => s.load);
  // undefined = still loading; null = no model config saved yet.
  const [config, setConfig] = useState<AccountModelConfig | null | undefined>(undefined);

  // Keys are E2EE: the list only resolves once the vault is unlocked.
  useEffect(() => {
    if (!session || providers !== null) return;
    void loadProviders().catch(() => {});
  }, [session, providers, loadProviders]);

  useEffect(() => {
    let isCurrent = true;
    void loadModelConfig(api).then((loaded) => {
      if (isCurrent) setConfig(loaded);
    });
    return () => {
      isCurrent = false;
    };
  }, []);

  if (!needsAiSetup(providers, config)) return null;

  return (
    <Card>
      <View className="flex-row items-start gap-3">
        <View className="rounded-lg bg-primary-soft p-2">
          <IconAi size={20} color="#2F6BD8" />
        </View>
        <View className="flex-1 gap-0.5">
          <Text className="text-sm font-semibold">{t("aiSetupTitle")}</Text>
          <Text variant="muted">{t("aiSetupDescription")}</Text>
        </View>
      </View>
      <Link href="/parent/settings/ai-providers" asChild>
        <Button label={t("aiSetupCta")} />
      </Link>
    </Card>
  );
}

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
import { Section } from "@/components/parent/section";
import { Button, Icon, Text } from "@/components/ui";
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
    <Section>
      <View className="flex-col gap-4 px-5 py-4">
        <View className="flex-row items-start gap-3.5">
          <View className="rounded-lg bg-primary-soft p-2">
            <Icon name="ai" size={20} color="primary" />
          </View>
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-semibold" accessibilityRole="header">
              {t("aiSetupTitle")}
            </Text>
            <Text className="mt-0.5 text-[13px] text-muted-foreground">{t("aiSetupDescription")}</Text>
          </View>
        </View>
        <Link href="/parent/settings/ai-providers" asChild>
          <Button>{t("aiSetupCta")}</Button>
        </Link>
      </View>
    </Section>
  );
}

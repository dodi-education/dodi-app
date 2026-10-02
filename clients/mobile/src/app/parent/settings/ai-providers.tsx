import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useTranslations } from "use-intl";
import { COLORS } from "@dodi/design-tokens";
import {
  byokProviderOptions,
  clearModelConfig,
  type DraftModelConfig,
  EMPTY_DRAFT,
  isDodiSelectable,
  loadModelConfigDraft,
  saveModelConfig,
} from "@dodi/client-state/model-config";

import { api } from "@/adapters/platform";
import { Section } from "@/components/parent/section";
import { ByokKeysPanel } from "@/components/settings/byok-keys-panel";
import { CapabilityModelConfig } from "@/components/settings/capability-model-config";
import { DodiAIPanel } from "@/components/settings/dodi-ai-panel";
import { Badge, Icon, TabsLabel, TabsList, TabsTrigger, Text } from "@/components/ui";
import { clientState, useDodiAIKeyStore, useProvidersStore } from "@/lib/client-state";

type Tab = "dodi-ai" | "byok";

/**
 * AI providers (web: parent/settings/ai-providers → ai-provider-config). With
 * dodi AI configured: two underlined tabs, "dodi AI" (state card + per-
 * capability pickers) and "Your own keys". Self-host (no dodi AI URL): the
 * own-keys page alone.
 */
export default function AiProvidersSettingsScreen() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const providersMap = useProvidersStore((s) => s.providers);
  const keyStatus = useDodiAIKeyStore((s) => s.status);
  const [isLoading, setIsLoading] = useState(true);
  const [config, setConfig] = useState<DraftModelConfig>(EMPTY_DRAFT);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [tab, setTab] = useState<Tab>("dodi-ai");
  const isDodiConfigured = clientState.dodiAI.isConfigured();

  useEffect(() => {
    let isCurrent = true;
    void loadModelConfigDraft({ api, providers: clientState.providers }).then((draft) => {
      if (!isCurrent) return;
      if (draft) setConfig(draft);
      setIsLoading(false);
    });
    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    if (!isSaved) return;
    const timer = setTimeout(() => setIsSaved(false), 2000);
    return () => clearTimeout(timer);
  }, [isSaved]);

  const byokProviders = byokProviderOptions(providersMap);
  const isDodiOffered = isDodiSelectable(isDodiConfigured, config, keyStatus);

  async function persist(next: DraftModelConfig): Promise<boolean> {
    if (!(await saveModelConfig(api, next))) return false;
    setConfig(next);
    return true;
  }

  async function clearConfig(): Promise<boolean> {
    if (!(await clearModelConfig(api))) return false;
    setConfig(EMPTY_DRAFT);
    return true;
  }

  async function save(): Promise<void> {
    setIsSaving(true);
    setIsSaved(false);
    try {
      if (await persist(config)) setIsSaved(true);
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <Section title={t("aiConfigTitle")}>
        <View className="flex-row items-center gap-2 px-5 py-3.5" accessibilityState={{ busy: true }}>
          <ActivityIndicator size="small" color={COLORS["muted-foreground"]} />
          <Text className="text-sm text-muted-foreground">{tc("loading")}</Text>
        </View>
      </Section>
    );
  }

  const capabilityConfig =
    byokProviders.length > 0 || isDodiOffered ? (
      <CapabilityModelConfig
        config={config}
        onChange={(patch) => setConfig((c) => ({ ...c, ...patch }))}
        byokProviders={byokProviders}
        isDodiSelectable={isDodiOffered}
        onSave={() => void save()}
        isSaving={isSaving}
        isSaved={isSaved}
      />
    ) : null;
  const byokPanel = <ByokKeysPanel onFirstKeySeeded={(patch) => void persist({ ...config, ...patch })} />;

  // Self-host: no dodi AI anywhere, the page is the own-keys experience.
  if (!isDodiConfigured) {
    return (
      <>
        {byokPanel}
        {capabilityConfig}
      </>
    );
  }

  return (
    <View>
      <TabsList>
        <TabsTrigger isActive={tab === "dodi-ai"} onPress={() => setTab("dodi-ai")}>
          <Icon name="sparkles" size={16} color={tab === "dodi-ai" ? "primary" : "muted-foreground"} />
          <TabsLabel isActive={tab === "dodi-ai"}>{t("aiTabManaged")}</TabsLabel>
        </TabsTrigger>
        <TabsTrigger isActive={tab === "byok"} onPress={() => setTab("byok")}>
          <TabsLabel isActive={tab === "byok"}>{t("aiTabByok")}</TabsLabel>
          {byokProviders.length > 0 ? <Badge variant="secondary">{byokProviders.length}</Badge> : null}
        </TabsTrigger>
      </TabsList>
      {tab === "dodi-ai" ? (
        <View>
          <DodiAIPanel config={config} applyConfig={persist} clearConfig={clearConfig} />
          {capabilityConfig}
        </View>
      ) : (
        byokPanel
      )}
    </View>
  );
}

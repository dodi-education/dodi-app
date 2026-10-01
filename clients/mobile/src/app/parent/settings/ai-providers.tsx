import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { useTranslations } from "use-intl";
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
import { ByokKeysPanel } from "@/components/settings/byok-keys-panel";
import { CapabilityModelConfig } from "@/components/settings/capability-model-config";
import { DodiAIPanel } from "@/components/settings/dodi-ai-panel";
import { Screen, Text } from "@/components/ui";
import { clientState, useDodiAIKeyStore, useProvidersStore } from "@/lib/client-state";
import { cn } from "@/lib/cn";

type Tab = "dodi-ai" | "byok";

/**
 * AI providers (web: parent/settings/ai-providers). With dodi AI configured:
 * two tabs, "dodi AI" (state card + per-capability pickers) and "Your own
 * keys". Self-host (no dodi AI URL): the own-keys page alone.
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
      <Screen>
        <View className="flex-row items-center gap-2" accessibilityState={{ busy: true }}>
          <ActivityIndicator color="#2F6BD8" />
          <Text variant="muted">{tc("loading")}</Text>
        </View>
      </Screen>
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

  if (!isDodiConfigured) {
    return (
      <Screen>
        {byokPanel}
        {capabilityConfig}
      </Screen>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "dodi-ai", label: t("aiTabManaged") },
    {
      id: "byok",
      label: byokProviders.length > 0 ? `${t("aiTabByok")} (${byokProviders.length})` : t("aiTabByok"),
    },
  ];
  return (
    <Screen>
      <View accessibilityRole="tablist" className="flex-row gap-1 rounded-xl bg-muted p-1">
        {tabs.map((item) => {
          const isActive = item.id === tab;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              onPress={() => setTab(item.id)}
              className={cn("min-h-11 flex-1 items-center justify-center rounded-lg px-2", isActive && "bg-card")}
            >
              <Text className={cn("text-sm font-semibold", isActive ? "text-primary" : "text-muted-foreground")}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {tab === "dodi-ai" ? (
        <>
          <DodiAIPanel config={config} applyConfig={persist} clearConfig={clearConfig} />
          {capabilityConfig}
        </>
      ) : (
        byokPanel
      )}
    </Screen>
  );
}

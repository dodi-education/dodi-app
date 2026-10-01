"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { dodi } from "@/lib/api";
import { isDodiAIConfigured } from "@/lib/dodi-ai";
import { Icon } from "@/components/shared/icon";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/parent/section";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { clientState } from "@/lib/client-state";
import { useDodiAIKeyStore } from "@/stores/dodi-ai-key-store";
import { useProvidersStore } from "@/stores/providers-store";
import {
  byokProviderOptions,
  clearModelConfig,
  type DraftModelConfig,
  EMPTY_DRAFT,
  isDodiSelectable,
  loadModelConfigDraft,
  saveModelConfig,
} from "@dodi/client-state/model-config";

import { ByokKeysPanel } from "./byok-keys-panel";
import { CapabilityModelConfig } from "./capability-model-config";
import { DodiAIPanel } from "./dodi-ai-panel";

/**
 * Settings → AI Providers. With dodi AI configured (NEXT_PUBLIC_DODI_AI_URL)
 * this is a two-tab page: "dodi AI" (managed — state card + the per-capability
 * pickers, where dodi AI and BYOK combine per category) and "Your own keys"
 * (BYOK). Self-host (no URL): the BYOK experience renders untabbed, exactly as
 * before dodi AI existed.
 */
export function AIProviderConfig() {
  const t = useTranslations("settings");

  const providersMap = useProvidersStore((s) => s.providers);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<DraftModelConfig>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const dodiConfigured = isDodiAIConfigured();
  const keyStatus = useDodiAIKeyStore((s) => s.status);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      // The vault's keys first, then the saved config; null when none (or the
      // vault is locked: the gate handles unlocking).
      const draft = await loadModelConfigDraft({
        api: dodi,
        providers: clientState.providers,
      });
      if (cancelled) return;
      if (draft) setConfig(draft);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const byokProviders = byokProviderOptions(providersMap);
  const dodiSelectable = isDodiSelectable(dodiConfigured, config, keyStatus);

  async function persist(next: DraftModelConfig): Promise<boolean> {
    if (!(await saveModelConfig(dodi, next))) return false;
    setConfig(next);
    return true;
  }

  async function clearConfig(): Promise<boolean> {
    if (!(await clearModelConfig(dodi))) return false;
    setConfig(EMPTY_DRAFT);
    return true;
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      if (await persist(config)) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Section title={t("aiConfigTitle")}>
        <div className="flex items-center gap-2 px-5 py-3.5 text-sm text-muted-foreground">
          <Icon name="loading" className="h-4 w-4 animate-spin" />
          Loading...
        </div>
      </Section>
    );
  }

  const capabilityConfig =
    byokProviders.length > 0 || dodiSelectable ? (
      <CapabilityModelConfig
        config={config}
        onChange={(patch) => setConfig((c) => ({ ...c, ...patch }))}
        byokProviders={byokProviders}
        dodiSelectable={dodiSelectable}
        onSave={() => void handleSave()}
        saving={saving}
        saved={saved}
      />
    ) : null;

  // Self-host: no dodi AI anywhere — the page is the BYOK experience as before.
  if (!dodiConfigured) {
    return (
      <>
        <ByokKeysPanel onFirstKeySeeded={(patch) => void persist({ ...config, ...patch })} />
        {capabilityConfig}
      </>
    );
  }

  return (
    <Tabs defaultValue="dodi-ai">
      <TabsList>
        <TabsTrigger value="dodi-ai">
          <Icon name="sparkles" className="h-4 w-4" />
          {t("aiTabManaged")}
        </TabsTrigger>
        <TabsTrigger value="byok">
          {t("aiTabByok")}
          {byokProviders.length > 0 ? (
            <Badge variant="secondary">{byokProviders.length}</Badge>
          ) : null}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="dodi-ai">
        <DodiAIPanel config={config} applyConfig={persist} clearConfig={clearConfig} />
        {capabilityConfig}
      </TabsContent>

      <TabsContent value="byok">
        <ByokKeysPanel onFirstKeySeeded={(patch) => void persist({ ...config, ...patch })} />
      </TabsContent>
    </Tabs>
  );
}

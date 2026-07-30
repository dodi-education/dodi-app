"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Icon } from "@/components/shared/icon";
import { useDateFormat } from "@/components/providers/date-format-provider";
import { Section } from "@/components/parent/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

import { AI_PROVIDERS } from "@dodi/ai/providers";
import { useDodiAIBillingStore } from "@/stores/dodi-ai-billing-store";
import { useDodiAIDefaultsStore } from "@/stores/dodi-ai-defaults-store";
import { useDodiAIKeyStore } from "@/stores/dodi-ai-key-store";
import { useProvidersStore } from "@/stores/providers-store";
import { DODI_DEFAULT_MODEL, type AIProviderId } from "@dodi/types/ai";

import type { DraftModelConfig } from "./capability-model-config";

interface DodiAIPanelProps {
  config: DraftModelConfig;
  /** PATCH the full config and mirror it into the page state. */
  applyConfig: (next: DraftModelConfig) => Promise<boolean>;
  /** DELETE the config (disable with no BYOK fallback) and clear page state. */
  clearConfig: () => Promise<boolean>;
}

function formatEur(cents: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

/**
 * The dodi AI state card: enable ("Turn on dodi AI" → mint keys + write the
 * "default"-sentinel config), active (balance "as of", disable switch,
 * reset-to-recommended), and needs-credits (empty balance — locked keys
 * self-heal on re-credit). "Enabled" is derived: any category on "dodi" —
 * there is no separate persisted flag.
 */
export function DodiAIPanel({ config, applyConfig, clearConfig }: DodiAIPanelProps) {
  const t = useTranslations("settings");
  const { formatDate } = useDateFormat();

  const billing = useDodiAIBillingStore((s) => s.billing);
  const keyStatus = useDodiAIKeyStore((s) => s.status);
  const defaults = useDodiAIDefaultsStore((s) => s.defaults);

  const [enabling, setEnabling] = useState(false);
  const [justEnabled, setJustEnabled] = useState(false);
  const [enableError, setEnableError] = useState<string | null>(null);

  useEffect(() => {
    void useDodiAIBillingStore.getState().load();
    void useDodiAIDefaultsStore.getState().load();
  }, []);

  const categories = ["voice", "thinking", "game", "image"] as const;
  const enabled = categories.some(
    (c) => config[`${c}Provider` as const] === "dodi",
  );
  const customized =
    enabled &&
    categories.some((c) => {
      const provider = config[`${c}Provider` as const];
      const model = config[`${c}Model` as const];
      return provider === "dodi" && model !== DODI_DEFAULT_MODEL;
    });
  const needsCredits =
    keyStatus === "no_balance" || (enabled && billing !== null && !billing.canUse);

  function recommendedConfig(): DraftModelConfig {
    return {
      voiceProvider: "dodi",
      voiceModel: DODI_DEFAULT_MODEL,
      voiceName: defaults?.voice.voice ?? "ara",
      thinkingProvider: "dodi",
      thinkingModel: DODI_DEFAULT_MODEL,
      gameProvider: "dodi",
      gameModel: DODI_DEFAULT_MODEL,
      imageProvider: "dodi",
      imageModel: DODI_DEFAULT_MODEL,
    };
  }

  async function handleEnable() {
    if (enabling) return;
    setEnabling(true);
    setEnableError(null);
    try {
      const keys = await useDodiAIKeyStore.getState().load(true);
      if (!keys) {
        // no_balance renders the needs-credits card via keyStatus; other
        // failures get the inline error.
        if (useDodiAIKeyStore.getState().status !== "no_balance") {
          setEnableError(t("managedEnableFailed"));
        }
        return;
      }
      const loadedDefaults = await useDodiAIDefaultsStore.getState().load();
      if (!loadedDefaults) {
        setEnableError(t("managedUnavailable"));
        return;
      }
      const ok = await applyConfig({
        ...recommendedConfig(),
        voiceName: loadedDefaults.voice.voice ?? "ara",
      });
      if (!ok) {
        setEnableError(t("managedEnableFailed"));
        return;
      }
      setJustEnabled(true);
      setTimeout(() => setJustEnabled(false), 5000);
      void useDodiAIBillingStore.getState().load(true);
    } finally {
      setEnabling(false);
    }
  }

  /** Disable: fall back to BYOK per category (or clear the whole config when
   *  no BYOK voice provider exists). The commercial key is NOT revoked —
   *  enforcement stays on the balance/lock plane; only client memory is
   *  dropped. */
  async function handleDisable() {
    const vaultProviders = Object.keys(
      useProvidersStore.getState().providers ?? {},
    ) as AIProviderId[];
    const byokWith = (
      flag: "supportsVoice" | "supportsThinking" | "supportsAgentic" | "supportsImage",
    ) =>
      vaultProviders
        .map((id) => AI_PROVIDERS.find((p) => p.id === id))
        .find((def) => def && !def.isManaged && def[flag]);

    const next: DraftModelConfig = { ...config };
    if (config.voiceProvider === "dodi") {
      const def = byokWith("supportsVoice");
      if (!def) {
        // No BYOK voice fallback → the account returns to unconfigured.
        const ok = await clearConfig();
        if (ok) useDodiAIKeyStore.getState().clear();
        return;
      }
      next.voiceProvider = def.id;
      next.voiceModel =
        (def.models.find((m) => m.capabilities.includes("voice")) ?? def.models[0])
          ?.id ?? "";
      next.voiceName = def.voices[0]?.id ?? "";
    }
    if (config.thinkingProvider === "dodi") {
      const def = byokWith("supportsThinking");
      next.thinkingProvider = def?.id ?? "";
      next.thinkingModel =
        def?.models.find((m) => m.capabilities.includes("thinking"))?.id ?? "";
    }
    if (config.gameProvider === "dodi") {
      const def = byokWith("supportsAgentic");
      next.gameProvider = def?.id ?? "";
      next.gameModel =
        def?.models.find((m) => m.capabilities.includes("agentic"))?.id ?? "";
    }
    if (config.imageProvider === "dodi") {
      const def = byokWith("supportsImage");
      next.imageProvider = def?.id ?? "";
      next.imageModel =
        def?.models.find((m) => m.capabilities.includes("image"))?.id ?? "";
    }

    const ok = await applyConfig(next);
    if (ok) useDodiAIKeyStore.getState().clear();
  }

  async function handleReset() {
    await applyConfig(recommendedConfig());
  }

  const balanceLine =
    billing !== null
      ? t("managedBalanceAsOf", {
          amount: formatEur(billing.balance.totalCents),
          date: billing.lastReconcileAt ? formatDate(billing.lastReconcileAt) : "—",
        })
      : null;

  return (
    <div>
      <p className="mb-4 text-[13px] text-muted-foreground">{t("managedIntro")}</p>

      <Section>
        <div className="flex items-center gap-4 px-5 py-4">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${enabled ? "bg-primary text-white" : "bg-primary-soft text-primary"}`}
          >
            <Icon name="sparkles" className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              <span className="text-sm font-semibold">{t("managedTitle")}</span>
              {enabled ? (
                <Badge variant="success">{t("managedActive")}</Badge>
              ) : null}
            </div>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {enabled ? t("managedActiveDescription") : t("managedEnableDescription")}
            </p>
            {enabled && balanceLine ? (
              <p className="mt-0.5 text-[12.5px] text-muted-foreground">{balanceLine}</p>
            ) : null}
          </div>
          {enabled ? (
            <Switch
              checked
              onCheckedChange={() => void handleDisable()}
              aria-label={t("managedDisable")}
            />
          ) : enabling ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Icon name="loading" className="h-4 w-4 animate-spin" />
              {t("managedEnabling")}
            </div>
          ) : (
            <Button onClick={() => void handleEnable()} className="cursor-pointer">
              {t("managedEnable")}
            </Button>
          )}
        </div>

        {needsCredits ? (
          <div className="flex items-start gap-2 px-5 py-3 text-[13px]">
            <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <div>
              <span className="font-medium">{t("managedNeedsCredits")}</span>{" "}
              <span className="text-muted-foreground">{t("managedNeedsCreditsHint")}</span>
            </div>
          </div>
        ) : null}

        {enableError ? (
          <div className="flex items-center gap-2 px-5 py-3 text-[13px] text-danger">
            <Icon name="alert" className="h-4 w-4" />
            {enableError}
          </div>
        ) : null}

        {justEnabled ? (
          <div className="flex items-center gap-2 px-5 py-3 text-[13px] text-success">
            <Icon name="success" className="h-4 w-4" />
            {t("managedJustEnabled")}
          </div>
        ) : null}

        {customized && !justEnabled ? (
          <div className="flex items-center justify-between gap-3 px-5 py-3">
            <span className="text-[13px] text-muted-foreground">{t("managedCustomized")}</span>
            <Button
              variant="link"
              size="sm"
              onClick={() => void handleReset()}
              className="cursor-pointer px-0"
            >
              {t("managedResetRecommended")}
            </Button>
          </div>
        ) : null}
      </Section>
    </div>
  );
}

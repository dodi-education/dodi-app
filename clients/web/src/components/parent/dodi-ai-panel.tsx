"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { AiSharingConsent } from "@/components/parent/ai-sharing-consent";
import { Icon } from "@/components/shared/icon";
import { useDateFormat } from "@/components/providers/date-format-provider";
import { Section } from "@/components/parent/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

import { clientState } from "@/lib/client-state";
import { useDodiAIBillingStore } from "@/stores/dodi-ai-billing-store";
import { useDodiAIDefaultsStore } from "@/stores/dodi-ai-defaults-store";
import { useDodiAIKeyStore } from "@/stores/dodi-ai-key-store";
import {
  disableDodiAI,
  enableDodiAI,
  isDodiCustomized,
  needsDodiCredits,
  recommendedDodiConfig,
} from "@dodi/client-state/dodi-ai-settings";
import {
  type DraftModelConfig,
  formatEurCents as formatEur,
  usesDodiAI,
} from "@dodi/client-state/model-config";

interface DodiAIPanelProps {
  config: DraftModelConfig;
  /** PATCH the full config and mirror it into the page state. */
  applyConfig: (next: DraftModelConfig) => Promise<boolean>;
  /** DELETE the config (disable with no BYOK fallback) and clear page state. */
  clearConfig: () => Promise<boolean>;
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
  const settingsDeps = {
    dodiAIKeys: clientState.dodiAIKeys,
    dodiAIDefaults: clientState.dodiAIDefaults,
    dodiAIBilling: clientState.dodiAIBilling,
    providers: clientState.providers,
  };

  const [enabling, setEnabling] = useState(false);
  const [justEnabled, setJustEnabled] = useState(false);
  const [enableError, setEnableError] = useState<string | null>(null);
  const [hasConsented, setHasConsented] = useState(false);

  useEffect(() => {
    void useDodiAIBillingStore.getState().load();
    void useDodiAIDefaultsStore.getState().load();
  }, []);

  const enabled = usesDodiAI(config);
  const customized = isDodiCustomized(config);
  const needsCredits = needsDodiCredits(config, keyStatus, billing);

  async function handleEnable() {
    if (enabling || !hasConsented) return;
    setEnabling(true);
    setEnableError(null);
    // Mint keys, then write the recommended config. An empty balance renders
    // the needs-credits card via keyStatus; other failures get the inline error.
    try {
      const outcome = await enableDodiAI(settingsDeps, applyConfig);
      if (outcome.kind === "error") {
        setEnableError(t(outcome.key));
      } else if (outcome.kind === "enabled") {
        setJustEnabled(true);
        setTimeout(() => setJustEnabled(false), 5000);
      }
    } finally {
      setEnabling(false);
    }
  }

  /** Disable: fall back to BYOK per category (or clear the whole config when
   *  no BYOK voice provider exists). The commercial key is NOT revoked —
   *  enforcement stays on the balance/lock plane; only client memory is
   *  dropped. */
  async function handleDisable() {
    await disableDodiAI(settingsDeps, config, applyConfig, clearConfig);
  }

  async function handleReset() {
    await applyConfig(recommendedDodiConfig(defaults?.voice.voice));
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
            <Button
              onClick={() => void handleEnable()}
              disabled={!hasConsented}
              className="cursor-pointer"
            >
              {t("managedEnable")}
            </Button>
          )}
        </div>

        {!enabled ? (
          <div className="px-5 pb-4">
            <AiSharingConsent
              checked={hasConsented}
              onCheckedChange={setHasConsented}
              providerName={null}
            />
          </div>
        ) : null}

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

/**
 * The dodi AI state card (web: parent/dodi-ai-panel): turn on (mint keys and
 * write the recommended config), active (balance, off switch, reset to
 * recommended) and needs-credits. "On" is derived: any category on dodi AI.
 */
import { useEffect, useState } from "react";
import { Switch, View } from "react-native";
import { useTranslations } from "use-intl";
import {
  type ApplyModelConfig,
  disableDodiAI,
  enableDodiAI,
  isDodiCustomized,
  needsDodiCredits,
  recommendedDodiConfig,
} from "@dodi/client-state/dodi-ai-settings";
import { type DraftModelConfig, formatEurCents, usesDodiAI } from "@dodi/client-state/model-config";

import { Button, Card, Notice, Text } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { IconSparkles } from "@/components/ui/icons";
import {
  clientState,
  useDodiAIBillingStore,
  useDodiAIDefaultsStore,
  useDodiAIKeyStore,
} from "@/lib/client-state";
import { useAccountDateFormat } from "@/lib/date-format";
import { useLocaleSetting } from "@/lib/intl";

const settingsDeps = () => ({
  dodiAIKeys: clientState.dodiAIKeys,
  dodiAIDefaults: clientState.dodiAIDefaults,
  dodiAIBilling: clientState.dodiAIBilling,
  providers: clientState.providers,
});

export function DodiAIPanel({
  config,
  applyConfig,
  clearConfig,
}: {
  config: DraftModelConfig;
  applyConfig: ApplyModelConfig;
  clearConfig: () => Promise<boolean>;
}) {
  const t = useTranslations("settings");
  const { locale } = useLocaleSetting();
  const { formatDate } = useAccountDateFormat();
  const billing = useDodiAIBillingStore((s) => s.billing);
  const keyStatus = useDodiAIKeyStore((s) => s.status);
  const defaults = useDodiAIDefaultsStore((s) => s.defaults);
  const [isEnabling, setIsEnabling] = useState(false);
  const [isJustEnabled, setIsJustEnabled] = useState(false);
  const [enableError, setEnableError] = useState<string | null>(null);

  useEffect(() => {
    void clientState.dodiAIBilling.getState().load();
    void clientState.dodiAIDefaults.getState().load();
  }, []);

  useEffect(() => {
    if (!isJustEnabled) return;
    const timer = setTimeout(() => setIsJustEnabled(false), 5000);
    return () => clearTimeout(timer);
  }, [isJustEnabled]);

  const isEnabled = usesDodiAI(config);
  const isCustomized = isDodiCustomized(config);
  const needsCredits = needsDodiCredits(config, keyStatus, billing);

  async function enable(): Promise<void> {
    if (isEnabling) return;
    setIsEnabling(true);
    setEnableError(null);
    try {
      const outcome = await enableDodiAI(settingsDeps(), applyConfig);
      if (outcome.kind === "error") setEnableError(t(outcome.key));
      else if (outcome.kind === "enabled") setIsJustEnabled(true);
    } finally {
      setIsEnabling(false);
    }
  }

  const balanceLine =
    billing !== null
      ? t("managedBalanceAsOf", {
          amount: formatEurCents(billing.balance.totalCents, locale),
          date: billing.lastReconcileAt ? formatDate(billing.lastReconcileAt) : "-",
        })
      : null;

  return (
    <View className="gap-3">
      <Text variant="muted">{t("managedIntro")}</Text>
      <Card>
        <View className="flex-row items-center gap-3">
          <View
            className={
              isEnabled
                ? "h-10 w-10 items-center justify-center rounded-lg bg-primary"
                : "h-10 w-10 items-center justify-center rounded-lg bg-primary-soft"
            }
          >
            <IconSparkles size={20} color={isEnabled ? "#FFFFFF" : "#2F6BD8"} />
          </View>
          <View className="flex-1 gap-1">
            <Text className="font-semibold">{t("managedTitle")}</Text>
            {isEnabled ? <Badge tone="success" label={t("managedActive")} /> : null}
          </View>
          {isEnabled ? (
            <Switch
              accessibilityLabel={t("managedDisable")}
              value
              onValueChange={() => void disableDodiAI(settingsDeps(), config, applyConfig, clearConfig)}
              trackColor={{ true: "#2F6BD8", false: "#D3DDE8" }}
            />
          ) : null}
        </View>
        <Text variant="muted">{isEnabled ? t("managedActiveDescription") : t("managedEnableDescription")}</Text>
        {isEnabled && balanceLine ? <Text variant="muted">{balanceLine}</Text> : null}
        {!isEnabled ? (
          <Button
            label={isEnabling ? t("managedEnabling") : t("managedEnable")}
            isLoading={isEnabling}
            onPress={() => void enable()}
          />
        ) : null}
        {needsCredits ? (
          <Notice tone="danger">{`${t("managedNeedsCredits")} ${t("managedNeedsCreditsHint")}`}</Notice>
        ) : null}
        {enableError ? <Notice tone="danger">{enableError}</Notice> : null}
        {isJustEnabled ? <Notice tone="success">{t("managedJustEnabled")}</Notice> : null}
        {isCustomized && !isJustEnabled ? (
          <View className="gap-1">
            <Text variant="muted">{t("managedCustomized")}</Text>
            <Button
              variant="ghost"
              className="self-start px-0"
              label={t("managedResetRecommended")}
              onPress={() => void applyConfig(recommendedDodiConfig(defaults?.voice.voice))}
            />
          </View>
        ) : null}
      </Card>
    </View>
  );
}

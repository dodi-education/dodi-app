/**
 * The dodi AI state card (web: parent/dodi-ai-panel): turn on (mint keys and
 * write the recommended config), active (balance, off switch, reset to
 * recommended) and needs-credits. "On" is derived: any category on dodi AI.
 */
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useTranslations } from "use-intl";
import { COLORS } from "@dodi/design-tokens";
import {
  type ApplyModelConfig,
  disableDodiAI,
  enableDodiAI,
  isDodiCustomized,
  needsDodiCredits,
  recommendedDodiConfig,
} from "@dodi/client-state/dodi-ai-settings";
import { type DraftModelConfig, formatEurCents, usesDodiAI } from "@dodi/client-state/model-config";

import { Section } from "@/components/parent/section";
import { Badge, Button, Icon, Switch, Text } from "@/components/ui";
import {
  clientState,
  useDodiAIBillingStore,
  useDodiAIDefaultsStore,
  useDodiAIKeyStore,
} from "@/lib/client-state";
import { cn } from "@/lib/cn";
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
    <View>
      <Text className="mb-4 text-[13px] text-muted-foreground">{t("managedIntro")}</Text>

      <Section>
        <View className="flex-row items-center gap-4 px-5 py-4">
          <View
            className={cn(
              "size-10 shrink-0 items-center justify-center rounded-lg",
              isEnabled ? "bg-primary" : "bg-primary-soft",
            )}
          >
            <Icon name="sparkles" size={20} color={isEnabled ? "primary-foreground" : "primary"} />
          </View>
          <View className="min-w-0 flex-1">
            <View className="flex-row flex-wrap items-center gap-2.5">
              <Text className="text-sm font-semibold">{t("managedTitle")}</Text>
              {isEnabled ? <Badge variant="success">{t("managedActive")}</Badge> : null}
            </View>
            <Text className="mt-0.5 text-[13px] text-muted-foreground">
              {isEnabled ? t("managedActiveDescription") : t("managedEnableDescription")}
            </Text>
            {isEnabled && balanceLine ? (
              <Text className="mt-0.5 text-[12.5px] text-muted-foreground">{balanceLine}</Text>
            ) : null}
          </View>
          {isEnabled ? (
            <Switch
              checked
              onCheckedChange={() => void disableDodiAI(settingsDeps(), config, applyConfig, clearConfig)}
              accessibilityLabel={t("managedDisable")}
            />
          ) : isEnabling ? (
            <View className="flex-row items-center gap-2" accessibilityState={{ busy: true }}>
              <ActivityIndicator size="small" color={COLORS["muted-foreground"]} />
              <Text className="text-sm text-muted-foreground">{t("managedEnabling")}</Text>
            </View>
          ) : (
            <Button onPress={() => void enable()}>{t("managedEnable")}</Button>
          )}
        </View>

        {needsCredits ? (
          <View className="flex-row items-start gap-2 px-5 py-3">
            <View className="mt-0.5">
              <Icon name="alert" size={16} color="danger" />
            </View>
            <Text className="min-w-0 flex-1 text-[13px]">
              <Text className="text-[13px] font-medium">{t("managedNeedsCredits")}</Text>{" "}
              <Text className="text-[13px] text-muted-foreground">{t("managedNeedsCreditsHint")}</Text>
            </Text>
          </View>
        ) : null}

        {enableError ? (
          <View className="flex-row items-center gap-2 px-5 py-3" accessibilityRole="alert">
            <Icon name="alert" size={16} color="danger" />
            <Text className="min-w-0 flex-1 text-[13px] text-danger">{enableError}</Text>
          </View>
        ) : null}

        {isJustEnabled ? (
          <View className="flex-row items-center gap-2 px-5 py-3">
            <Icon name="success" size={16} color="success" />
            <Text className="min-w-0 flex-1 text-[13px] text-success">{t("managedJustEnabled")}</Text>
          </View>
        ) : null}

        {isCustomized && !isJustEnabled ? (
          <View className="flex-row items-center justify-between gap-3 px-5 py-3">
            <Text className="min-w-0 flex-1 text-[13px] text-muted-foreground">{t("managedCustomized")}</Text>
            <Button
              variant="link"
              size="sm"
              className="px-0"
              onPress={() => void applyConfig(recommendedDodiConfig(defaults?.voice.voice))}
            >
              {t("managedResetRecommended")}
            </Button>
          </View>
        ) : null}
      </Section>
    </View>
  );
}

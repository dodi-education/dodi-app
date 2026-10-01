/**
 * The per-capability provider / model pickers (web: parent/capability-model-config):
 * Voice, Thinking, Game generation, Image. Each lists dodi AI (when active)
 * and the own providers that support the capability; under dodi AI a
 * category shows its service name instead of a model picker.
 */
import { View } from "react-native";
import { useTranslations } from "use-intl";
import {
  CATEGORY_FIELDS,
  defaultModelFor,
  type DraftModelConfig,
  isDraftSavable,
  modelOptionsFor,
  type ProviderOption,
  providerOptionsFor,
  voiceOptionsFor,
  voiceProviderPatch,
} from "@dodi/client-state/model-config";
import type { AIProviderId } from "@dodi/types/ai";

import { Button, Card, Text } from "@/components/ui";
import { ChoiceList } from "@/components/ui/choice-list";

const PROVIDER_NONE = "__none__";

export interface CapabilityModelConfigProps {
  config: DraftModelConfig;
  onChange: (patch: Partial<DraftModelConfig>) => void;
  /** The own providers in the vault. */
  byokProviders: ProviderOption[];
  /** dodi AI is active: offer it in every picker. */
  isDodiSelectable: boolean;
  onSave: () => void;
  isSaving: boolean;
  isSaved: boolean;
}

function ServiceName({ label, name }: { label: string; name: string }) {
  return (
    <View className="gap-1">
      <Text variant="label">{label}</Text>
      <Text variant="muted">{name}</Text>
    </View>
  );
}

export function CapabilityModelConfig({
  config,
  onChange,
  byokProviders,
  isDodiSelectable,
  onSave,
  isSaving,
  isSaved,
}: CapabilityModelConfigProps) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const dodiLabel = isDodiSelectable ? t("managedProviderOption") : null;
  const toChoices = <T extends string>(options: { id: T; name: string }[]) =>
    options.map((o) => ({ value: o.id, label: o.name }));

  const copy = {
    thinking: {
      title: t("thinkingModel"),
      desc: t("thinkingModelDescription"),
      providerLabel: t("thinkingProvider"),
      modelLabel: t("thinkingModel"),
      fallback: t("thinkingProviderFallback"),
      service: t("serviceThinking"),
    },
    game: {
      title: t("gameConfig"),
      desc: t("gameConfigDescription"),
      providerLabel: t("gameProvider"),
      modelLabel: t("gameModel"),
      fallback: t("gameProviderFallback"),
      service: t("serviceCode"),
    },
    image: {
      title: t("imageConfig"),
      desc: t("imageConfigDescription"),
      providerLabel: t("imageProvider"),
      modelLabel: t("imageModel"),
      fallback: t("imageProviderFallback"),
      service: t("serviceImage"),
    },
  };

  const voices = voiceOptionsFor(config.voiceProvider);
  return (
    <>
      <Card title={t("voiceConfig")} description={t("voiceConfigDescription")}>
        <ChoiceList<AIProviderId | "">
          label={t("voiceProvider")}
          choices={toChoices(providerOptionsFor("voice", byokProviders, dodiLabel))}
          value={config.voiceProvider}
          onChange={(id) => id && onChange(voiceProviderPatch(id))}
        />
        {voices ? (
          <>
            {config.voiceProvider === "dodi" ? (
              <ServiceName label={t("voiceModel")} name={t("serviceVoice")} />
            ) : (
              <ChoiceList
                label={t("voiceModel")}
                choices={toChoices(modelOptionsFor(config.voiceProvider, "voice"))}
                value={config.voiceModel}
                onChange={(voiceModel) => onChange({ voiceModel })}
              />
            )}
            <ChoiceList
              label={t("voiceName")}
              choices={toChoices(voices)}
              value={config.voiceName}
              onChange={(voiceName) => onChange({ voiceName })}
            />
          </>
        ) : null}
      </Card>

      {CATEGORY_FIELDS.map((cat, index) => {
        const text = copy[cat.key];
        const provider = config[cat.provider];
        const set = (nextProvider: AIProviderId | "", model: string) =>
          onChange({ [cat.provider]: nextProvider, [cat.model]: model });
        const isLast = index === CATEGORY_FIELDS.length - 1;
        return (
          <Card key={cat.key} title={text.title} description={text.desc}>
            <ChoiceList
              label={text.providerLabel}
              choices={[
                { value: PROVIDER_NONE as AIProviderId | typeof PROVIDER_NONE, label: text.fallback },
                ...toChoices(providerOptionsFor(cat.capability, byokProviders, dodiLabel)),
              ]}
              value={provider || PROVIDER_NONE}
              onChange={(value) => {
                if (value === PROVIDER_NONE) return set("", "");
                const id = value as AIProviderId;
                set(id, defaultModelFor(id, cat.capability));
              }}
            />
            {provider === "dodi" ? (
              <ServiceName label={text.modelLabel} name={text.service} />
            ) : provider ? (
              <ChoiceList
                label={text.modelLabel}
                choices={toChoices(modelOptionsFor(provider, cat.capability))}
                value={config[cat.model]}
                onChange={(model) => set(provider, model)}
              />
            ) : null}
            {isLast ? (
              <View className="flex-row items-center gap-3">
                <Button
                  className="flex-1"
                  label={tc("save")}
                  isLoading={isSaving}
                  disabled={!isDraftSavable(config)}
                  onPress={onSave}
                />
                {isSaved ? <Text variant="muted">{t("configSaved")}</Text> : null}
              </View>
            ) : null}
          </Card>
        );
      })}
    </>
  );
}
